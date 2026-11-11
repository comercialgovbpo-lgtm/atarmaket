import "server-only";
import { createHash } from "node:crypto";
import { systemDb, type Tx } from "../db";
import { suggestCategory, type CategoryRef } from "../atas/categorize";
import { clean } from "../atas/text";
import {
  PncpClient, mapLimit, parseControlNumber, plausibleDate, pncpPublicUrl, POWER_FROM_PNCP, SPHERE_FROM_PNCP, yyyymmdd,
  type PncpAtaListItem, type PncpCompra,
} from "./pncp-client";

export interface SyncOptions {
  mode: "atualizacao" | "vigencia";
  from?: Date;
  to?: Date;
  maxPages?: number;
  pageSize?: number;
  fetchItems?: boolean;
  maxItemsPerProcurement?: number;
  triggeredBy?: string;
  startPage?: number;
}
interface Counters { fetched: number; created: number; updated: number; unchanged: number; expired: number; duplicates: number; errors: number; details: { ref: string; error: string }[] }

const API = "https://pncp.gov.br";

/**
 * Sincroniza atas do PNCP. Idempotente: registros existentes são atualizados apenas quando o conteúdo muda
 * (hash), com histórico em ata_change_log. Nada é apagado; atas vencidas/canceladas passam a "encerrada".
 */
export async function runPncpSync(opts: SyncOptions) {
  const source = await systemDb((tx) => tx.one<{ id: string; config: Record<string, number | boolean> }>("SELECT id, config FROM ata_sources WHERE code = 'pncp' AND active"));
  if (!source) throw new Error("Fonte PNCP inativa ou ausente");
  const cfg = source.config ?? {};
  const to = opts.to ?? new Date();
  const from = opts.from ?? new Date(to.getTime() - Number(cfg.window_days ?? 2) * 86_400_000);
  const maxPages = opts.maxPages ?? Number(cfg.max_pages_per_run ?? 20);
  const pageSize = opts.pageSize ?? Number(cfg.page_size ?? 50);
  const fetchItems = opts.fetchItems ?? cfg.fetch_items !== false;
  const maxItems = opts.maxItemsPerProcurement ?? Number(cfg.max_items_per_procurement ?? 80);
  const client = new PncpClient(Number(cfg.request_interval_ms ?? 250));
  const concurrency = Math.max(1, Math.min(8, Number(cfg.concurrency ?? 4)));

  // Execuções interrompidas (queda do processo) não ficam eternamente "executando"
  await systemDb((tx) => tx.exec(
    `UPDATE synchronization_logs SET status = 'falhou', finished_at = now(),
            error_details = error_details || '[{"ref":"execucao","error":"Interrompida (processo encerrado antes do término)"}]'::jsonb
      WHERE status = 'executando' AND started_at < now() - interval '2 hours'`));
  const params = { mode: opts.mode, from: yyyymmdd(from), to: yyyymmdd(to), maxPages, pageSize, fetchItems, startPage: opts.startPage ?? 1 };
  const log = await systemDb((tx) => tx.one<{ id: string }>(
    "INSERT INTO synchronization_logs(source_id, job, status, params, triggered_by) VALUES ($1,$2,'executando',$3,$4) RETURNING id",
    [source.id, `pncp_${opts.mode}`, JSON.stringify(params), opts.triggeredBy ?? "agendamento"]));
  const c: Counters = { fetched: 0, created: 0, updated: 0, unchanged: 0, expired: 0, duplicates: 0, errors: 0, details: [] };
  const categories = await systemDb((tx) => tx.many<CategoryRef>("SELECT id, slug, keywords FROM categories WHERE active"));
  const compraCache = new Map<string, string | null>();
  let status: "sucesso" | "parcial" | "falhou" = "sucesso";
  let lastPage = 0;
  let totalPages = 0;

  try {
    for (let page = params.startPage; page < params.startPage + maxPages; page++) {
      const res = opts.mode === "atualizacao"
        ? await client.atasByUpdate(params.from, params.to, page, pageSize)
        : await client.atasByValidity(params.from, params.to, page, pageSize);
      if (!res || !res.data?.length) break;
      totalPages = res.totalPaginas;
      lastPage = page;
      // Atas da mesma contratação ficam no mesmo grupo (sequencial); grupos rodam em paralelo.
      const groups = new Map<string, PncpAtaListItem[]>();
      for (const ata of res.data) groups.set(ata.numeroControlePNCPCompra, [...(groups.get(ata.numeroControlePNCPCompra) ?? []), ata]);
      await mapLimit([...groups.values()], Math.max(1, Math.ceil(concurrency / 2)), async (group) => {
        for (const ata of group) {
          c.fetched++;
          try {
            await syncOne(client, source.id, ata, categories, compraCache, c, fetchItems, maxItems, concurrency);
          } catch (e) {
            c.errors++;
            if (c.details.length < 50) c.details.push({ ref: ata.numeroControlePNCPAta, error: (e as Error).message.slice(0, 300) });
          }
        }
      });
      if (res.paginasRestantes <= 0) break;
    }
    c.expired += await expireAtas();
    if (c.errors > 0) status = c.errors >= c.fetched && c.fetched > 0 ? "falhou" : "parcial";
  } catch (e) {
    status = c.fetched > 0 ? "parcial" : "falhou";
    c.details.push({ ref: "execucao", error: (e as Error).message.slice(0, 300) });
    c.errors++;
  } finally {
    await systemDb(async (tx) => {
      await tx.exec(
        `UPDATE synchronization_logs SET status=$2, fetched=$3, created=$4, updated=$5, unchanged=$6, expired=$7, duplicates=$8,
                errors=$9, error_details=$10, finished_at=now(), params = params || $11::jsonb WHERE id=$1`,
        [log!.id, status, c.fetched, c.created, c.updated, c.unchanged, c.expired, c.duplicates, c.errors, JSON.stringify(c.details),
         JSON.stringify({ lastPage, totalPages })]);
      await tx.exec("UPDATE ata_sources SET last_sync_at = now(), last_sync_cursor = $2 WHERE id = $1", [source.id, `${params.to}:${lastPage}`]);
    });
  }
  return { logId: log!.id, status, ...c, lastPage, totalPages };
}

/** Marca como encerradas as atas públicas vencidas ou canceladas, registrando histórico. */
export async function expireAtas(): Promise<number> {
  return systemDb(async (tx) => {
    const rows = await tx.many<{ id: string; status: string }>(
      `UPDATE price_registration_atas a SET status = 'encerrada', status_updated_at = now()
         FROM (SELECT id, status FROM price_registration_atas
                WHERE status NOT IN ('encerrada','rascunho','rejeitada')
                  AND (cancelled OR validity_end < current_date) FOR UPDATE) old
        WHERE a.id = old.id RETURNING a.id, old.status`);
    for (const r of rows)
      await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, reason) VALUES ($1,$2,'encerrada',$3)",
        [r.id, r.status, "Vigência expirada ou cancelamento registrado na fonte (rotina automática)"]);
    return rows.length;
  });
}

async function syncOne(
  client: PncpClient, sourceId: string, a: PncpAtaListItem, categories: CategoryRef[],
  compraCache: Map<string, string | null>, c: Counters, fetchItems: boolean, maxItems: number, concurrency: number,
) {
  const ids = parseControlNumber(a.numeroControlePNCPAta);
  if (!ids || ids.seqAta == null) throw new Error("Número de controle não reconhecido");
  const compraKey = a.numeroControlePNCPCompra;

  // 1) Contratação de origem (uma vez por execução)
  let procId = compraCache.get(compraKey);
  let needsItems = false;
  if (procId === undefined) {
    const known = await systemDb((tx) => tx.one<{ id: string; items_synced_at: Date | null }>(
      "SELECT id, items_synced_at FROM procurement_records WHERE source_id = $1 AND external_id = $2", [sourceId, compraKey]));
    if (!known || !known.items_synced_at) {
      const compra: PncpCompra | null = await client.compra(ids.cnpj, ids.ano, ids.seq);
      procId = await systemDb((tx) => upsertProcurement(tx, sourceId, compraKey, a, compra, ids));
      needsItems = compra !== null;
    } else procId = known.id;
    compraCache.set(compraKey, procId);
  }

  // 2) Ata
  const validityEnd = plausibleDate(a.vigenciaFim);
  const payload = {
    ata_number: clean(a.numeroAtaRegistroPreco) || "s/n",
    year: a.anoAta,
    object: clean(a.objetoContratacao) || "Objeto não informado na fonte",
    signature_date: plausibleDate(a.dataAssinatura),
    validity_start: plausibleDate(a.vigenciaInicio),
    validity_end: validityEnd,
    cancelled: Boolean(a.cancelado),
    cancelled_at: a.dataCancelamento,
    source_reported_adhesion: a.possibilidadeAdesao,
    managing_unit_name: clean(a.nomeUnidadeOrgao) || null,
    uasg: a.codigoUnidadeOrgao,
  };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const sourceUrl = pncpPublicUrl.ata(ids.cnpj, ids.ano, ids.seq, ids.seqAta);

  const result = await systemDb(async (tx) => {
    const existing = await tx.one<Record<string, unknown> & { id: string; content_hash: string; status: string }>(
      "SELECT * FROM price_registration_atas WHERE source_id = $1 AND external_id = $2", [sourceId, a.numeroControlePNCPAta]);
    const proc = await tx.one<{ city: string | null; state: string | null; modality: string | null; procurement_number: string | null; process_number: string | null; government_entity_id: string | null }>(
      "SELECT city, state, modality, procurement_number, process_number, government_entity_id FROM procurement_records WHERE id = $1", [procId]);
    if (!existing) {
      const categoryId = suggestCategory([payload.object], categories);
      const expired = payload.cancelled || (validityEnd != null && validityEnd < new Date().toISOString().slice(0, 10));
      const status = expired ? "encerrada" : "importada";
      const row = await tx.one<{ id: string }>(
        `INSERT INTO price_registration_atas (source_id, external_id, origin, procurement_record_id, managing_entity_id, managing_unit_name, uasg,
            ata_number, year, process_number, procurement_reference, modality, object, category_id, category_auto, city, state,
            signature_date, validity_start, validity_end, cancelled, cancelled_at, status, source_reported_adhesion, source_url,
            collected_at, source_updated_at, last_synced_at, content_hash, raw, published_at)
         VALUES ($1,$2,'fonte_publica',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now(),$24,now(),$25,$26,now())
         RETURNING id`,
        [sourceId, a.numeroControlePNCPAta, procId, proc?.government_entity_id ?? null, payload.managing_unit_name, payload.uasg,
         payload.ata_number, payload.year, proc?.process_number ?? null, proc?.procurement_number ? `${proc.modality ?? "Contratação"} nº ${proc.procurement_number}` : null,
         proc?.modality ?? null, payload.object, categoryId, proc?.city ?? null, proc?.state ?? null, payload.signature_date, payload.validity_start,
         validityEnd, payload.cancelled, payload.cancelled_at, status, payload.source_reported_adhesion, sourceUrl,
         a.dataAtualizacaoGlobal ?? a.dataAtualizacao, hash, JSON.stringify(a)]);
      await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, reason) VALUES ($1,NULL,$2,$3)",
        [row!.id, status, "Importada do PNCP"]);
      // Possível duplicidade com ata cadastrada por fornecedor (mesmo órgão, número e ano)
      const dup = await tx.exec(
        `UPDATE price_registration_atas d SET moderation_notes = coalesce(d.moderation_notes || E'\\n','') || $3
          WHERE d.origin = 'fornecedor' AND d.duplicate_of IS NULL AND d.managing_entity_id = $1
            AND regexp_replace(lower(d.ata_number),'[^0-9a-z]','','g') = regexp_replace(lower($2),'[^0-9a-z]','','g')`,
        [proc?.government_entity_id ?? null, payload.ata_number, `Possível duplicidade com ata importada do PNCP ${a.numeroControlePNCPAta}`]);
      return { kind: "created" as const, id: row!.id, dup };
    }
    if (existing.content_hash === hash) {
      await tx.exec("UPDATE price_registration_atas SET last_synced_at = now() WHERE id = $1", [existing.id]);
      return { kind: "unchanged" as const, id: existing.id, dup: 0 };
    }
    const changes: Record<string, { de: unknown; para: unknown }> = {};
    for (const [k, v] of Object.entries(payload)) {
      const old = existing[k] instanceof Date ? (existing[k] as Date).toISOString() : existing[k];
      if (String(old ?? "") !== String(v ?? "")) changes[k] = { de: old ?? null, para: v ?? null };
    }
    const validityChanged = "validity_end" in changes || "validity_start" in changes;
    await tx.exec(
      `UPDATE price_registration_atas SET ata_number=$2, year=$3, object=$4, signature_date=$5, validity_start=$6, validity_end=$7,
          cancelled=$8, cancelled_at=$9, source_reported_adhesion=$10, managing_unit_name=$11, uasg=$12,
          source_updated_at=$13, last_synced_at=now(), content_hash=$14, raw=$15,
          validity_confirmed = CASE WHEN $16 THEN false ELSE validity_confirmed END
        WHERE id=$1`,
      [existing.id, payload.ata_number, payload.year, payload.object, payload.signature_date, payload.validity_start, validityEnd,
       payload.cancelled, payload.cancelled_at, payload.source_reported_adhesion, payload.managing_unit_name, payload.uasg,
       a.dataAtualizacaoGlobal ?? a.dataAtualizacao, hash, JSON.stringify(a), validityChanged]);
    if (Object.keys(changes).length)
      await tx.exec("INSERT INTO ata_change_log(ata_id, origin, changes) VALUES ($1,'sincronizacao',$2)", [existing.id, JSON.stringify(changes)]);
    // Reabre ata encerrada se a fonte passou a indicar vigência (ex.: prorrogação)
    if (existing.status === "encerrada" && !payload.cancelled && validityEnd && validityEnd >= new Date().toISOString().slice(0, 10)) {
      await tx.exec("UPDATE price_registration_atas SET status='importada', status_updated_at=now() WHERE id=$1", [existing.id]);
      await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, reason) VALUES ($1,'encerrada','importada',$2)",
        [existing.id, "Fonte passou a informar vigência ativa"]);
    }
    return { kind: "updated" as const, id: existing.id, dup: 0 };
  });
  c[result.kind]++;
  c.duplicates += result.dup;

  // 3) Documentos da ata (somente quando a ata é nova ou mudou na fonte)
  const arquivos = result.kind === "unchanged" ? null : await client.arquivosAta(ids.cnpj, ids.ano, ids.seq, ids.seqAta).catch(() => null);
  if (arquivos?.length) {
    await systemDb(async (tx) => {
      for (const f of arquivos) {
        if (f.statusAtivo === false) continue;
        const url = (f.url ?? f.uri ?? "").replace("/pncp-api/", "/api/pncp/");
        if (!url) continue;
        await tx.exec(
          `INSERT INTO ata_documents(ata_id, kind, title, visibility, external_url, published_at_source)
           VALUES ($1,$2,$3,'public',$4,$5) ON CONFLICT DO NOTHING`,
          [result.id, /aditivo/i.test(f.tipoDocumentoNome) ? "termo_aditivo" : "ata", `${f.tipoDocumentoNome} — ${f.titulo} #${f.sequencialDocumento}`, url, f.dataPublicacaoPncp]);
      }
      const first = await tx.one<{ external_url: string }>("SELECT external_url FROM ata_documents WHERE ata_id = $1 AND kind = 'ata' ORDER BY published_at_source NULLS LAST LIMIT 1", [result.id]);
      if (first) await tx.exec("UPDATE price_registration_atas SET original_document_url = $2 WHERE id = $1 AND original_document_url IS DISTINCT FROM $2", [result.id, first.external_url]);
    });
  }

  // 4) Itens e resultados (preço homologado e fornecedor) — uma vez por contratação nova
  if (fetchItems && needsItems) await syncItems(client, procId!, ids, maxItems, concurrency);
}

async function upsertProcurement(
  tx: Tx, sourceId: string, ctrl: string, a: PncpAtaListItem, compra: PncpCompra | null,
  ids: { cnpj: string; ano: number; seq: number },
): Promise<string> {
  const sphere = compra?.orgaoEntidade?.esferaId ? SPHERE_FROM_PNCP[compra.orgaoEntidade.esferaId] ?? null : null;
  const power = compra?.orgaoEntidade?.poderId ? POWER_FROM_PNCP[compra.orgaoEntidade.poderId] ?? null : null;
  const uf = compra?.unidadeOrgao?.ufSigla ?? null;
  const city = compra?.unidadeOrgao?.municipioNome ?? null;
  const gov = await tx.one<{ id: string }>(
    `INSERT INTO government_entities(cnpj, name, sphere, power, state, city, ibge_code) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (cnpj) DO UPDATE SET name = EXCLUDED.name,
        sphere = coalesce(EXCLUDED.sphere, government_entities.sphere), power = coalesce(EXCLUDED.power, government_entities.power),
        state = coalesce(government_entities.state, EXCLUDED.state), city = coalesce(government_entities.city, EXCLUDED.city)
     RETURNING id`,
    [ids.cnpj, clean(compra?.orgaoEntidade?.razaoSocial ?? a.nomeOrgao), sphere, power, uf, city, compra?.unidadeOrgao?.codigoIbge ?? null]);
  const row = await tx.one<{ id: string }>(
    `INSERT INTO procurement_records(source_id, external_id, government_entity_id, unit_code, unit_name, modality, procurement_number,
        process_number, year, sequence, object, city, state, ibge_code, source_url, raw, source_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (source_id, external_id) DO UPDATE SET government_entity_id = EXCLUDED.government_entity_id,
        unit_code = EXCLUDED.unit_code, unit_name = EXCLUDED.unit_name, modality = EXCLUDED.modality,
        procurement_number = EXCLUDED.procurement_number, process_number = EXCLUDED.process_number, object = EXCLUDED.object,
        city = EXCLUDED.city, state = EXCLUDED.state, ibge_code = EXCLUDED.ibge_code, raw = EXCLUDED.raw, source_updated_at = EXCLUDED.source_updated_at
     RETURNING id`,
    [sourceId, ctrl, gov!.id, compra?.unidadeOrgao?.codigoUnidade ?? a.codigoUnidadeOrgao, clean(compra?.unidadeOrgao?.nomeUnidade ?? a.nomeUnidadeOrgao),
     compra?.modalidadeNome ?? null, compra?.numeroCompra ?? null, compra?.processo ?? null, ids.ano, ids.seq,
     clean(compra?.objetoCompra ?? a.objetoContratacao), city, uf, compra?.unidadeOrgao?.codigoIbge ?? null,
     pncpPublicUrl.compra(ids.cnpj, ids.ano, ids.seq), compra ? JSON.stringify(compra) : null, compra?.dataAtualizacaoGlobal ?? null]);
  return row!.id;
}

async function syncItems(client: PncpClient, procId: string, ids: { cnpj: string; ano: number; seq: number }, maxItems: number, concurrency: number) {
  const items = [];
  for (let page = 1; page <= 10 && items.length < maxItems; page++) {
    const batch = await client.itens(ids.cnpj, ids.ano, ids.seq, page, 100);
    if (!batch?.length) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  const withResult = items.filter((i) => i.temResultado).slice(0, maxItems);
  const truncated = items.filter((i) => i.temResultado).length > withResult.length;
  const results: { item: (typeof items)[number]; r: NonNullable<Awaited<ReturnType<PncpClient["resultados"]>>>[number] }[] = [];
  const perItem = await mapLimit(withResult, concurrency, (it) => client.resultados(ids.cnpj, ids.ano, ids.seq, it.numeroItem).catch(() => null));
  withResult.forEach((it, k) => { for (const r of perItem[k] ?? []) if (!r.dataCancelamento) results.push({ item: it, r }); });
  const atas = (await client.atasDaCompra(ids.cnpj, ids.ano, ids.seq).catch(() => null))?.data?.filter((x) => !x.cancelado) ?? [];

  await systemDb(async (tx) => {
    const supplierIds = new Map<string, string>();
    for (const { r } of results) {
      if (r.tipoPessoa !== "PJ" || !/^\d{14}$/.test(r.niFornecedor) || supplierIds.has(r.niFornecedor)) continue;
      const s = await tx.one<{ id: string }>(
        `INSERT INTO suppliers(cnpj, legal_name, company_size, first_seen_source) VALUES ($1,$2,$3,'pncp')
         ON CONFLICT (cnpj) DO UPDATE SET company_size = coalesce(suppliers.company_size, EXCLUDED.company_size)
         RETURNING id`, [r.niFornecedor, clean(r.nomeRazaoSocialFornecedor), r.porteFornecedorNome]);
      supplierIds.set(r.niFornecedor, s!.id);
    }
    // Vínculo com a ata somente quando a contratação possui uma única ata (a fonte não informa o vínculo por item)
    let singleAtaId: string | null = null;
    if (atas.length === 1) {
      const row = await tx.one<{ id: string }>("SELECT id FROM price_registration_atas WHERE external_id = $1", [atas[0].numeroControlePNCP]);
      singleAtaId = row?.id ?? null;
    }
    for (const { item, r } of results) {
      const isPJ = r.tipoPessoa === "PJ";
      const catalogType = /catmat/i.test(item.catalogo ?? "") ? "CATMAT" : /catser/i.test(item.catalogo ?? "") ? "CATSER" : item.catalogoCodigoItem ? "OUTRO" : null;
      await tx.exec(
        `INSERT INTO ata_items(ata_id, procurement_record_id, item_number, catalog_type, catalog_code, material_or_service, description, unit,
            quantity, unit_price, total_price, supplier_id, supplier_ni, supplier_name, link_status, external_ref, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (procurement_record_id, external_ref) WHERE external_ref IS NOT NULL DO UPDATE SET
            ata_id = EXCLUDED.ata_id, quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price, total_price = EXCLUDED.total_price,
            supplier_id = EXCLUDED.supplier_id, supplier_name = EXCLUDED.supplier_name, link_status = EXCLUDED.link_status, raw = EXCLUDED.raw`,
        [singleAtaId, procId, item.numeroItem, catalogType, item.catalogoCodigoItem, item.materialOuServico, clean(item.descricao), clean(item.unidadeMedida),
         r.quantidadeHomologada, r.valorUnitarioHomologado, r.valorTotalHomologado,
         isPJ ? supplierIds.get(r.niFornecedor) ?? null : null, isPJ ? r.niFornecedor : null,
         isPJ ? clean(r.nomeRazaoSocialFornecedor) : "Pessoa física (dados protegidos)",
         singleAtaId ? "vinculo_unico_fonte" : "nao_vinculado", `${item.numeroItem}-${r.sequencialResultado}`,
         JSON.stringify({ item: { ...item, informacaoComplementar: undefined }, resultado: { ...r, niFornecedor: isPJ ? r.niFornecedor : undefined } })]);
    }
    if (singleAtaId) {
      const distinct = [...new Set(results.filter((x) => x.r.tipoPessoa === "PJ").map((x) => x.r.niFornecedor))];
      if (distinct.length === 1 && supplierIds.get(distinct[0]))
        await tx.exec("UPDATE price_registration_atas SET supplier_id = $2 WHERE id = $1 AND supplier_id IS NULL", [singleAtaId, supplierIds.get(distinct[0])]);
    }
    // Edital e anexos da contratação
    const arquivos = await client.arquivosCompra(ids.cnpj, ids.ano, ids.seq).catch(() => null);
    for (const f of arquivos ?? []) {
      if (f.statusAtivo === false) continue;
      const url = (f.url ?? f.uri ?? "").replace("/pncp-api/", "/api/pncp/");
      if (url) await tx.exec(
        `INSERT INTO ata_documents(procurement_record_id, kind, title, visibility, external_url, published_at_source)
         VALUES ($1,$2,$3,'public',$4,$5) ON CONFLICT DO NOTHING`,
        [procId, /edital/i.test(f.tipoDocumentoNome) ? "edital" : "outro", `${f.tipoDocumentoNome} — ${f.titulo}`, url, f.dataPublicacaoPncp]);
    }
    await tx.exec("UPDATE procurement_records SET items_synced_at = now(), raw = coalesce(raw,'{}'::jsonb) || $2::jsonb WHERE id = $1",
      [procId, JSON.stringify({ _sync: { itens: items.length, resultados: results.length, truncado: truncated, atas_na_contratacao: atas.length } })]);
  });
}

export { API as PNCP_API_BASE };

/**
 * Segunda fase da carga histórica: busca itens/resultados das contratações ainda sem itens
 * (útil após importar metadados com fetchItems=false). Prioriza atas vigentes.
 */
export async function runItemsBackfill(limit = 50, triggeredBy = "cli") {
  const source = await systemDb((tx) => tx.one<{ id: string; config: Record<string, number> }>("SELECT id, config FROM ata_sources WHERE code = 'pncp' AND active"));
  if (!source) throw new Error("Fonte PNCP inativa ou ausente");
  const client = new PncpClient(Number(source.config.request_interval_ms ?? 250));
  const concurrency = Math.max(1, Math.min(8, Number(source.config.concurrency ?? 4)));
  const maxItems = Number(source.config.max_items_per_procurement ?? 80);
  const log = await systemDb((tx) => tx.one<{ id: string }>(
    "INSERT INTO synchronization_logs(source_id, job, status, params, triggered_by) VALUES ($1,'pncp_itens','executando',$2,$3) RETURNING id",
    [source.id, JSON.stringify({ limit }), triggeredBy]));
  const pending = await systemDb((tx) => tx.many<{ id: string; external_id: string }>(
    `SELECT p.id, p.external_id FROM procurement_records p
      WHERE p.source_id = $1 AND p.items_synced_at IS NULL
      ORDER BY EXISTS (SELECT 1 FROM price_registration_atas a WHERE a.procurement_record_id = p.id AND a.status <> 'encerrada') DESC, p.created_at
      LIMIT $2`, [source.id, limit]));
  let done = 0, errors = 0;
  const details: { ref: string; error: string }[] = [];
  await mapLimit(pending, 2, async (p) => {
    const ids = parseControlNumber(p.external_id);
    if (!ids) return;
    try { await syncItems(client, p.id, ids, maxItems, concurrency); done++; }
    catch (e) { errors++; if (details.length < 50) details.push({ ref: p.external_id, error: (e as Error).message.slice(0, 300) }); }
  });
  await systemDb((tx) => tx.exec(
    "UPDATE synchronization_logs SET status = $2, fetched = $3, updated = $4, errors = $5, error_details = $6, finished_at = now() WHERE id = $1",
    [log!.id, errors && !done ? "falhou" : errors ? "parcial" : "sucesso", pending.length, done, errors, JSON.stringify(details)]));
  return { logId: log!.id, pending: pending.length, done, errors };
}

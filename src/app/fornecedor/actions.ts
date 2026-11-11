"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { canWriteOrg, requireOrg, userDb } from "@/lib/auth/session";
import { systemDb, type Tx } from "@/lib/db";
import { extractAta } from "@/lib/extraction";
import { notifyUsers, queueEmail } from "@/lib/notify";
import { getEntitlements, has } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { putFile, sniffMime } from "@/lib/storage";
import { suggestCategory, type CategoryRef } from "@/lib/atas/categorize";
import { cnpjSchema, formDataToObject, onlyDigits, optText, parseBrNumber, text, ufSchema, uuidSchema } from "@/lib/validators";

const fe = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
const optDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").optional());

async function supplierCtx() {
  const { user, org } = await requireOrg("supplier");
  if (!canWriteOrg(org)) redirect("/fornecedor?erro=permissao");
  return { user, org };
}

async function declaredSupplierId(tx: Tx) {
  return (await tx.one<{ id: string }>("SELECT id FROM app_declared_supplier_ids() AS id LIMIT 1"))?.id ?? null;
}

async function fornecedorSourceId(tx: Tx) {
  return (await tx.one<{ id: string }>("SELECT id FROM ata_sources WHERE code = 'fornecedor'"))!.id;
}

// ------------------------------------------------------------------ Cadastro de ata
const headerSchema = z.object({
  ata_number: text(60).pipe(z.string().min(1, "Informe o número da ata")),
  year: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(2000).max(2100).optional()),
  process_number: optText(80),
  procurement_reference: optText(160),
  uasg: optText(20),
  object: text(4000).pipe(z.string().min(10, "Descreva o objeto")),
  manager_cnpj: cnpjSchema,
  manager_name: text(300).pipe(z.string().min(3, "Informe o órgão gerenciador")),
  manager_sphere: z.enum(["federal", "estadual", "distrital", "municipal"], { message: "Selecione a esfera do gerenciador" }),
  state: ufSchema,
  city: text(120).pipe(z.string().min(2, "Informe o município")),
  signature_date: optDate,
  validity_start: optDate,
  validity_end: optDate,
  source_url: z.preprocess((v) => (v === "" ? undefined : v), z.string().url("URL inválida").max(500).refine((u) => /^https?:\/\//.test(u), "URL inválida").optional()),
  availability_note: optText(1000),
});

async function upsertHeader(tx: Tx, d: z.infer<typeof headerSchema>, ataId: string | null, orgId: string, userId: string) {
  const govId = (await tx.one<{ id: string }>("SELECT ensure_government_entity($1,$2,$3,$4,$5) AS id", [d.manager_cnpj, d.manager_name, d.manager_sphere, d.state, d.city]))!.id;
  const cats = await tx.many<CategoryRef>("SELECT id, slug, keywords FROM categories WHERE active");
  const categoryId = suggestCategory([d.object], cats);
  if (!ataId) {
    const row = await tx.one<{ id: string }>(
      `INSERT INTO price_registration_atas(source_id, origin, managing_entity_id, managing_unit_name, uasg, supplier_id, submitted_by_org_id, ata_number, year,
          process_number, procurement_reference, object, category_id, city, state, signature_date, validity_start, validity_end, status, source_url,
          availability_note, collected_at, created_by)
       VALUES ($1,'fornecedor',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'rascunho',$18,$19,now(),$20) RETURNING id`,
      [await fornecedorSourceId(tx), govId, d.manager_name, d.uasg ?? null, await declaredSupplierId(tx), orgId, d.ata_number, d.year ?? null,
       d.process_number ?? null, d.procurement_reference ?? null, d.object, categoryId, d.city, d.state, d.signature_date ?? null,
       d.validity_start ?? null, d.validity_end ?? null, d.source_url ?? null, d.availability_note ?? null, userId]);
    await tx.exec("INSERT INTO ata_status_history(ata_id, to_status, changed_by, reason) VALUES ($1,'rascunho',$2,'Cadastro pelo fornecedor')", [row!.id, userId]);
    return row!.id;
  }
  const before = await tx.one<Record<string, unknown>>("SELECT ata_number, object, validity_start, validity_end, signature_date, process_number FROM price_registration_atas WHERE id = $1", [ataId]);
  const n = await tx.exec(
    `UPDATE price_registration_atas SET managing_entity_id=$2, managing_unit_name=$3, uasg=$4, ata_number=$5, year=$6, process_number=$7,
        procurement_reference=$8, object=$9, category_id = CASE WHEN category_auto THEN $10 ELSE category_id END, city=$11, state=$12,
        signature_date=$13, validity_start=$14, validity_end=$15, source_url=$16, availability_note=$17
      WHERE id=$1 AND submitted_by_org_id = $18`,
    [ataId, govId, d.manager_name, d.uasg ?? null, d.ata_number, d.year ?? null, d.process_number ?? null, d.procurement_reference ?? null,
     d.object, categoryId, d.city, d.state, d.signature_date ?? null, d.validity_start ?? null, d.validity_end ?? null, d.source_url ?? null,
     d.availability_note ?? null, orgId]);
  if (!n) throw new Error("Ata não encontrada");
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of ["ata_number", "object", "validity_start", "validity_end", "signature_date", "process_number"] as const)
    if (String(before?.[k] ?? "") !== String(d[k] ?? "")) changes[k] = { de: before?.[k] ?? null, para: d[k] ?? null };
  if (Object.keys(changes).length) await tx.exec("INSERT INTO ata_change_log(ata_id, origin, changed_by, changes) VALUES ($1,'fornecedor',$2,$3)", [ataId, userId, JSON.stringify(changes)]);
  return ataId;
}

export async function saveAtaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  const raw = formDataToObject(fd);
  const p = headerSchema.safeParse({ ...raw, manager_cnpj: raw.manager_cnpj ?? "" });
  if (!p.success) return { fieldErrors: fe(p.error) };
  if (p.data.validity_start && p.data.validity_end && p.data.validity_end < p.data.validity_start) return { error: "O fim da vigência é anterior ao início." };
  const ataId = raw.ata_id ? uuidSchema.parse(raw.ata_id) : null;
  let id: string;
  try { id = await userDb((tx) => upsertHeader(tx, p.data, ataId, org.organization_id, user.id)); }
  catch (e) { return { error: (e as Error).message.includes("restrit") ? "Alteração não permitida neste status." : "Não foi possível salvar." }; }
  if (!ataId) redirect(`/fornecedor/atas/${id}?criada=1`);
  revalidatePath(`/fornecedor/atas/${id}`);
  return { ok: true, message: "Dados salvos." };
}

/** Upload de PDF + extração automática (IA/heurística). O resultado vira um RASCUNHO para revisão. */
export async function uploadExtractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  if (!rateLimit(`extract:${org.organization_id}`, 20, 3_600_000).ok) return { error: "Limite de processamentos por hora atingido." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o PDF da ata." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo acima de 25 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  if (sniffMime(buf) !== "application/pdf") return { error: "O arquivo enviado não é um PDF válido." };

  const stored = await putFile(buf, "pdf", `org/${org.organization_id}`);
  const outcome = await extractAta(buf);
  const d = outcome.data;

  const ataId = await userDb(async (tx) => {
    const doc = await tx.one<{ id: string }>(
      `INSERT INTO ata_documents(owner_org_id, kind, title, visibility, storage_path, mime_type, size_bytes, sha256, uploaded_by)
       VALUES ($1,'ata',$2,'public',$3,'application/pdf',$4,$5,$6) RETURNING id`,
      [org.organization_id, file.name.slice(0, 200) || "Ata de registro de preços.pdf", stored.storagePath, stored.size, stored.sha256, user.id]);
    let govId: string | null = null;
    if (d.managing_entity_cnpj) govId = (await tx.one<{ id: string }>("SELECT ensure_government_entity($1,$2,NULL,NULL,NULL) AS id", [d.managing_entity_cnpj, d.managing_entity_name ?? "Órgão informado no documento"]))!.id;
    const cats = await tx.many<CategoryRef>("SELECT id, slug, keywords FROM categories WHERE active");
    const ata = await tx.one<{ id: string }>(
      `INSERT INTO price_registration_atas(source_id, origin, managing_entity_id, managing_unit_name, uasg, supplier_id, submitted_by_org_id, ata_number,
          process_number, procurement_reference, object, category_id, signature_date, validity_start, validity_end, status, collected_at, created_by,
          year, moderation_notes)
       VALUES ($1,'fornecedor',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'rascunho',now(),$15,$16,$17) RETURNING id`,
      [await fornecedorSourceId(tx), govId, d.managing_entity_name, d.uasg, await declaredSupplierId(tx), org.organization_id, d.ata_number ?? "a confirmar",
       d.process_number, d.procurement_reference, d.object ?? "Objeto a confirmar a partir do documento", suggestCategory([d.object ?? ""], cats),
       d.signature_date, d.validity_start, d.validity_end, user.id, d.validity_start ? Number(d.validity_start.slice(0, 4)) : null,
       d.supplier_cnpj && d.supplier_cnpj !== onlyDigits(org.cnpj) ? `Atenção: CNPJ do fornecedor no documento (${d.supplier_cnpj}) difere do CNPJ da conta.` : null]);
    await tx.exec("UPDATE ata_documents SET ata_id = $2 WHERE id = $1", [doc!.id, ata!.id]);
    for (const it of d.items.slice(0, 500))
      await tx.exec(
        `INSERT INTO ata_items(ata_id, item_number, catalog_type, catalog_code, description, unit, quantity, unit_price, total_price, supplier_id, supplier_ni, supplier_name, link_status)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9, s.id, s.cnpj, s.legal_name, 'informado_fornecedor' FROM (SELECT $10::uuid AS sid) x LEFT JOIN suppliers s ON s.id = x.sid`,
        [ata!.id, it.item_number, it.catalog_type, it.catalog_code, it.description.slice(0, 2000), it.unit, it.quantity, it.unit_price, it.total_price, await declaredSupplierId(tx)]);
    await tx.exec(
      `INSERT INTO ata_extractions(organization_id, document_id, ata_id, method, model, status, text_chars, result, warnings, created_by)
       VALUES ($1,$2,$3,$4,$5,'concluida',$6,$7,$8,$9)`,
      [org.organization_id, doc!.id, ata!.id, outcome.method, outcome.model, outcome.textChars, JSON.stringify(d), JSON.stringify(outcome.warnings), user.id]);
    await tx.exec("INSERT INTO ata_status_history(ata_id, to_status, changed_by, reason) VALUES ($1,'rascunho',$2,$3)",
      [ata!.id, user.id, `Rascunho gerado por extração automática (${outcome.method === "llm" ? "IA" : "heurística"}) — requer revisão`]);
    await audit(tx, { id: user.id, role: "user" }, "ata_extraida", "ata", ata!.id, { method: outcome.method, items: d.items.length });
    return ata!.id;
  });
  redirect(`/fornecedor/atas/${ataId}?extraida=1`);
}

// ------------------------------------------------------------------ Itens
const itemSchema = z.object({
  ata_id: uuidSchema,
  item_number: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(100000).optional()),
  catalog_type: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["CATMAT", "CATSER", "OUTRO"]).optional()),
  catalog_code: optText(30),
  description: text(2000).pipe(z.string().min(3, "Descreva o item")),
  unit: optText(40),
  quantity: z.string().optional(),
  unit_price: z.string().optional(),
});

export async function addItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await supplierCtx();
  const p = itemSchema.safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fe(p.error) };
  const q = parseBrNumber(p.data.quantity), up = parseBrNumber(p.data.unit_price);
  if (q != null && q < 0 || up != null && up < 0) return { error: "Valores não podem ser negativos." };
  try {
    await userDb(async (tx) => {
      const sid = await declaredSupplierId(tx);
      await tx.exec(
        `INSERT INTO ata_items(ata_id, item_number, catalog_type, catalog_code, material_or_service, description, unit, quantity, unit_price, total_price, supplier_id, supplier_ni, supplier_name, link_status)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10, s.id, s.cnpj, s.legal_name, 'informado_fornecedor' FROM (SELECT $11::uuid AS sid) x LEFT JOIN suppliers s ON s.id = x.sid`,
        [p.data.ata_id, p.data.item_number ?? null, p.data.catalog_type ?? null, p.data.catalog_code ?? null,
         p.data.catalog_type === "CATSER" ? "S" : p.data.catalog_type === "CATMAT" ? "M" : null, p.data.description, p.data.unit ?? null, q, up,
         q != null && up != null ? Math.round(q * up * 100) / 100 : null, sid]);
      await tx.exec("INSERT INTO ata_change_log(ata_id, origin, changed_by, changes) VALUES ($1,'fornecedor',$2,$3)", [p.data.ata_id, user.id, JSON.stringify({ item_incluido: { de: null, para: p.data.description.slice(0, 120) } })]);
    });
  } catch { return { error: "Não foi possível incluir o item (verifique se a ata pertence à sua empresa)." }; }
  revalidatePath(`/fornecedor/atas/${p.data.ata_id}`);
  return { ok: true, message: "Item incluído." };
}

export async function deleteItemAction(fd: FormData) {
  const { user } = await supplierCtx();
  const p = z.object({ id: uuidSchema, ata_id: uuidSchema }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await userDb(async (tx) => {
    const n = await tx.exec("DELETE FROM ata_items WHERE id = $1 AND ata_id = $2", [p.data.id, p.data.ata_id]);
    if (n) await tx.exec("INSERT INTO ata_change_log(ata_id, origin, changed_by, changes) VALUES ($1,'fornecedor',$2,$3)", [p.data.ata_id, user.id, JSON.stringify({ item_removido: { de: p.data.id, para: null } })]);
  });
  revalidatePath(`/fornecedor/atas/${p.data.ata_id}`);
}

// ------------------------------------------------------------------ Documentos
export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  const p = z.object({ ata_id: uuidSchema, kind: z.enum(["ata", "edital", "termo_aditivo", "evidencia", "outro"]), title: text(200).pipe(z.string().min(2, "Informe o título")), visibility: z.enum(["public", "private"]) }).safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fe(p.error) };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) return { error: "Formatos aceitos: PDF, PNG ou JPEG." };
  if (buf.length > 25 * 1024 * 1024) return { error: "Arquivo acima de 25 MB." };
  const stored = await putFile(buf, mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg", `org/${org.organization_id}`);
  try {
    await userDb((tx) => tx.exec(
      `INSERT INTO ata_documents(ata_id, owner_org_id, kind, title, visibility, storage_path, mime_type, size_bytes, sha256, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [p.data.ata_id, org.organization_id, p.data.kind, p.data.title, p.data.kind === "evidencia" ? "private" : p.data.visibility, stored.storagePath, mime, stored.size, stored.sha256, user.id]));
  } catch { return { error: "Não foi possível anexar o documento." }; }
  revalidatePath(`/fornecedor/atas/${p.data.ata_id}`);
  return { ok: true, message: "Documento anexado." };
}

// ------------------------------------------------------------------ Envio para validação
export async function submitForValidationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  const ataId = uuidSchema.safeParse(fd.get("ata_id"));
  if (!ataId.success) return { error: "Ata inválida." };
  if (fd.get("reviewed") !== "on") return { error: "Confirme que revisou todos os dados (inclusive os extraídos automaticamente)." };
  const r = await userDb(async (tx) => {
    const ent = await getEntitlements(tx, org.organization_id);
    if (!ent.planCode) return { error: "Contrate um plano para publicar atas no marketplace." };
    const used = await tx.one<{ n: number }>(
      "SELECT count(*)::int n FROM price_registration_atas WHERE submitted_by_org_id = $1 AND status NOT IN ('rascunho','rejeitada','encerrada') AND id <> $2", [org.organization_id, ataId.data]);
    if ((used?.n ?? 0) >= ent.ataLimit) return { error: `Limite de ${ent.ataLimit} ata(s) do plano ${ent.planName} atingido.` };
    const a = await tx.one<{ status: string; validity_end: string | null; items: number; docs: number; managing_entity_id: string | null }>(
      `SELECT status, validity_end, managing_entity_id, (SELECT count(*)::int FROM ata_items WHERE ata_id = a.id) items,
              (SELECT count(*)::int FROM ata_documents WHERE ata_id = a.id AND kind = 'ata') docs FROM price_registration_atas a WHERE id = $1 AND submitted_by_org_id = $2`,
      [ataId.data, org.organization_id]);
    if (!a) return { error: "Ata não encontrada." };
    if (!["rascunho", "rejeitada"].includes(a.status)) return { error: "Esta ata já foi enviada." };
    if (!a.managing_entity_id) return { error: "Informe e salve o órgão gerenciador (CNPJ e nome)." };
    if (!a.validity_end) return { error: "Informe a data final de vigência." };
    if (a.items === 0) return { error: "Cadastre ao menos um item." };
    if (a.docs === 0) return { error: "Anexe o documento original da ata (PDF)." };
    await tx.exec("UPDATE price_registration_atas SET status = 'em_validacao', status_updated_at = now() WHERE id = $1", [ataId.data]);
    await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,'em_validacao',$3,'Enviada para validação pelo fornecedor')", [ataId.data, a.status, user.id]);
    await tx.exec("UPDATE ata_extractions SET status = 'revisada', reviewed_at = now() WHERE ata_id = $1 AND status = 'concluida'", [ataId.data]);
    await audit(tx, { id: user.id, role: "user" }, "ata_enviada_validacao", "ata", ataId.data);
    return { ok: true };
  });
  if ("error" in r) return { error: r.error };
  await systemDb(async (tx) => {
    const admins = await tx.many<{ id: string }>("SELECT id FROM users WHERE platform_role = 'admin' AND status = 'active'");
    await notifyUsers(tx, admins.map((x) => x.id), { title: "Ata aguardando validação", body: org.legal_name, link: `/admin/atas/${ataId.data}`, dedupeKey: `val:${ataId.data}:${Date.now()}` });
  });
  revalidatePath(`/fornecedor/atas/${ataId.data}`);
  return { ok: true, message: "Ata enviada para validação. Você será notificado após a análise." };
}

export async function deleteDraftAction(fd: FormData) {
  const { user } = await supplierCtx();
  const id = uuidSchema.safeParse(fd.get("ata_id"));
  if (!id.success) return;
  await userDb(async (tx) => {
    await tx.exec("DELETE FROM price_registration_atas WHERE id = $1 AND status = 'rascunho'", [id.data]);
    await audit(tx, { id: user.id, role: "user" }, "rascunho_excluido", "ata", id.data);
  });
  redirect("/fornecedor/atas");
}

export async function closeAtaAction(fd: FormData) {
  const { user } = await supplierCtx();
  const id = uuidSchema.safeParse(fd.get("ata_id"));
  if (!id.success) return;
  await userDb(async (tx) => {
    const old = await tx.one<{ status: string }>("SELECT status FROM price_registration_atas WHERE id = $1", [id.data]);
    if (!old || old.status === "encerrada") return;
    await tx.exec("UPDATE price_registration_atas SET status = 'encerrada', status_updated_at = now() WHERE id = $1", [id.data]);
    await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,'encerrada',$3,'Fornecedor informou indisponibilidade/encerramento')", [id.data, old.status, user.id]);
  });
  revalidatePath(`/fornecedor/atas/${id.data}`);
}

// ------------------------------------------------------------------ Solicitações e CRM
export async function respondContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  const p = z.object({ id: uuidSchema, response: text(4000).pipe(z.string().min(5, "Escreva a resposta")) }).safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fe(p.error) };
  const req = await userDb(async (tx) => {
    const r = await tx.one<{ requester_user_id: string; contact_email: string; ata_id: string }>(
      "UPDATE contact_requests SET status = 'respondida', supplier_response = $2, responded_at = now() WHERE id = $1 RETURNING requester_user_id, contact_email, ata_id", [p.data.id, p.data.response]);
    if (!r) return null;
    const opp = await tx.one<{ id: string; status: string }>("SELECT id, status FROM commercial_opportunities WHERE contact_request_id = $1", [p.data.id]);
    if (opp) {
      if (opp.status === "novo_interessado") {
        await tx.exec("UPDATE commercial_opportunities SET status = 'contato_iniciado', last_contact_at = current_date WHERE id = $1", [opp.id]);
        await tx.exec("INSERT INTO opportunity_events(opportunity_id, author_id, kind, from_status, to_status, note) VALUES ($1,$2,'mudanca_status','novo_interessado','contato_iniciado','Resposta enviada pela plataforma')", [opp.id, user.id]);
      } else await tx.exec("INSERT INTO opportunity_events(opportunity_id, author_id, kind, note, occurred_at) VALUES ($1,$2,'contato','Resposta enviada pela plataforma',current_date)", [opp.id, user.id]);
    }
    return r;
  });
  if (!req) return { error: "Solicitação não encontrada." };
  await systemDb(async (tx) => {
    await notifyUsers(tx, [req.requester_user_id], { title: `Resposta de ${org.legal_name}`, link: "/orgao/solicitacoes", dedupeKey: `resp:${p.data.id}` });
    await queueEmail(tx, req.contact_email, `Resposta do fornecedor ${org.legal_name}`, `O fornecedor respondeu à sua solicitação. Acesse a plataforma para ler a resposta.`);
    await audit(tx, { id: user.id, role: "user" }, "solicitacao_respondida", "contact_request", p.data.id);
  });
  revalidatePath("/fornecedor/solicitacoes");
  return { ok: true, message: "Resposta enviada." };
}

export async function markContactViewedAction(fd: FormData) {
  await supplierCtx();
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  await userDb((tx) => tx.exec("UPDATE contact_requests SET status = 'visualizada' WHERE id = $1 AND status = 'enviada'", [id.data]));
  revalidatePath("/fornecedor/solicitacoes");
}

const OPP = ["novo_interessado", "contato_iniciado", "em_negociacao", "aguardando_documentacao", "adesao_em_analise", "convertido", "perdido"] as const;

async function requireCrm(orgId: string) {
  const ent = await userDb((tx) => getEntitlements(tx, orgId));
  if (!has(ent, "crm")) redirect("/fornecedor/assinatura?recurso=crm");
}

export async function createOpportunityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  await requireCrm(org.organization_id);
  const p = z.object({
    title: text(200).pipe(z.string().min(3, "Informe o título")), government_name: text(300).pipe(z.string().min(3, "Identifique o órgão interessado")),
    contact_name: optText(120), contact_email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email().optional()), contact_phone: optText(30),
    ata_id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()), estimated_value: z.string().optional(),
    last_contact_at: optDate, note: optText(3000),
  }).safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fe(p.error) };
  const id = await userDb(async (tx) => {
    const o = await tx.one<{ id: string }>(
      `INSERT INTO commercial_opportunities(supplier_org_id, ata_id, title, government_name, contact_name, contact_email, contact_phone, estimated_value, last_contact_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [org.organization_id, p.data.ata_id ?? null, p.data.title, p.data.government_name, p.data.contact_name ?? null, p.data.contact_email ?? null,
       p.data.contact_phone ?? null, parseBrNumber(p.data.estimated_value), p.data.last_contact_at ?? null, user.id]);
    await tx.exec("INSERT INTO opportunity_events(opportunity_id, author_id, kind, to_status, note) VALUES ($1,$2,'mudanca_status','novo_interessado',$3)", [o!.id, user.id, p.data.note ?? "Oportunidade registrada manualmente"]);
    return o!.id;
  });
  redirect(`/fornecedor/oportunidades/${id}`);
}

export async function updateOpportunityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  await requireCrm(org.organization_id);
  const p = z.object({ id: uuidSchema, status: z.enum(OPP), note: optText(3000), contact_date: optDate, next_action_at: optDate, estimated_value: z.string().optional() }).safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fe(p.error) };
  await userDb(async (tx) => {
    const old = await tx.one<{ status: string }>("SELECT status FROM commercial_opportunities WHERE id = $1", [p.data.id]);
    if (!old) return;
    await tx.exec(
      `UPDATE commercial_opportunities SET status = $2, next_action_at = $3, estimated_value = coalesce($4, estimated_value),
              last_contact_at = coalesce($5, last_contact_at) WHERE id = $1`,
      [p.data.id, p.data.status, p.data.next_action_at ?? null, parseBrNumber(p.data.estimated_value), p.data.contact_date ?? null]);
    if (old.status !== p.data.status)
      await tx.exec("INSERT INTO opportunity_events(opportunity_id, author_id, kind, from_status, to_status, note, occurred_at) VALUES ($1,$2,'mudanca_status',$3,$4,$5,$6)",
        [p.data.id, user.id, old.status, p.data.status, p.data.note ?? null, p.data.contact_date ?? null]);
    else if (p.data.note || p.data.contact_date)
      await tx.exec("INSERT INTO opportunity_events(opportunity_id, author_id, kind, note, occurred_at) VALUES ($1,$2,$3,$4,$5)",
        [p.data.id, user.id, p.data.contact_date ? "contato" : "nota", p.data.note ?? null, p.data.contact_date ?? null]);
  });
  revalidatePath(`/fornecedor/oportunidades/${p.data.id}`);
  return { ok: true, message: "Oportunidade atualizada." };
}

// ------------------------------------------------------------------ Perfil público e reivindicação
export async function updateSupplierProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await supplierCtx();
  const p = z.object({
    trade_name: optText(200), profile_description: optText(3000), website: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().max(300).refine((u) => /^https?:\/\//.test(u)).optional()),
    public_email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email().optional()), public_phone: optText(30), show_contact: z.string().optional(),
  }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: "Verifique os campos (site deve começar com https://)." };
  const n = await userDb(async (tx) => {
    const c = await tx.exec(
      `UPDATE suppliers SET trade_name = coalesce($1, trade_name), profile_description = $2, website = $3, public_email = $4, public_phone = $5, show_contact = $6
        WHERE id IN (SELECT app_supplier_ids())`,
      [p.data.trade_name ?? null, p.data.profile_description ?? null, p.data.website ?? null, p.data.public_email ?? null, p.data.public_phone ?? null, p.data.show_contact === "on"]);
    if (c) await audit(tx, { id: user.id, role: "user" }, "perfil_fornecedor_atualizado", "supplier", null);
    return c;
  });
  if (!n) return { error: "O perfil público é liberado após a verificação da titularidade da empresa." };
  return { ok: true, message: "Perfil atualizado." };
}

export async function claimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await supplierCtx();
  const p = z.object({
    ata_id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()),
    relationship: z.enum(["titular", "representante_comercial"]),
    justification: text(3000).pipe(z.string().min(20, "Descreva o vínculo (mínimo de 20 caracteres)")),
  }).safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fe(p.error) };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Anexe a evidência (contrato social, procuração, contrato de representação ou ata assinada)." };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || buf.length > 25 * 1024 * 1024) return { error: "Evidência deve ser PDF/PNG/JPEG de até 25 MB." };
  const stored = await putFile(buf, mime === "application/pdf" ? "pdf" : "jpg", `claims/${org.organization_id}`);
  const r = await userDb(async (tx) => {
    let supplierId: string | null = null;
    if (p.data.ata_id) {
      const a = await tx.one<{ supplier_id: string | null }>("SELECT supplier_id FROM price_registration_atas WHERE id = $1", [p.data.ata_id]);
      if (!a) return { error: "Ata não encontrada." };
      supplierId = a.supplier_id ?? (p.data.relationship === "titular" ? await declaredSupplierId(tx) : null);
    } else supplierId = await declaredSupplierId(tx);
    if (!supplierId) return { error: "Não foi possível identificar o fornecedor da ata. Descreva o vínculo e a equipe analisará." };
    const doc = await tx.one<{ id: string }>(
      "INSERT INTO ata_documents(owner_org_id, kind, title, visibility, storage_path, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,'evidencia',$2,'private',$3,$4,$5,$6,$7) RETURNING id",
      [org.organization_id, `Evidência de ${p.data.relationship}`, stored.storagePath, mime, stored.size, stored.sha256, user.id]);
    const c = await tx.one<{ id: string }>(
      `INSERT INTO supplier_claims(supplier_id, ata_id, claimant_org_id, claimant_user_id, relationship, justification, evidence_document_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [supplierId, p.data.ata_id ?? null, org.organization_id, user.id, p.data.relationship, p.data.justification, [doc!.id]]);
    await audit(tx, { id: user.id, role: "user" }, "reivindicacao_enviada", "supplier_claim", c!.id);
    return { ok: true };
  });
  if ("error" in r) return { error: r.error };
  return { ok: true, message: "Reivindicação enviada para análise administrativa." };
}

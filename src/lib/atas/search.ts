import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { onlyDigits, parseBrNumber } from "../validators";
import { PUBLIC_STATUSES } from "./status";

export const searchSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  catalogo: z.string().trim().max(20).optional().catch(undefined), // CATMAT / CATSER
  cnpj: z.string().trim().max(20).optional().catch(undefined), // CNPJ do fornecedor
  fornecedor: z.string().trim().max(120).optional().catch(undefined),
  orgao: z.string().trim().max(120).optional().catch(undefined), // órgão gerenciador (nome ou CNPJ)
  uf: z.string().trim().toUpperCase().length(2).optional().catch(undefined),
  municipio: z.string().trim().max(80).optional().catch(undefined),
  vigenteAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  somenteVigentes: z.enum(["1", "0"]).optional().catch(undefined),
  precoMin: z.string().max(20).optional().catch(undefined),
  precoMax: z.string().max(20).optional().catch(undefined),
  categoria: z.string().trim().max(60).optional().catch(undefined),
  status: z.string().max(200).optional().catch(undefined), // lista separada por vírgula
  origem: z.enum(["fonte_publica", "fornecedor"]).optional().catch(undefined),
  ordem: z.enum(["relevancia", "recentes", "vencimento", "preco"]).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});
export type SearchParams = z.infer<typeof searchSchema>;

export interface SearchResult {
  id: string; ata_number: string; year: number | null; object: string; status: string; origin: string;
  validity_start: string | null; validity_end: string | null; cancelled: boolean;
  city: string | null; state: string | null; source_url: string | null; original_document_url: string | null;
  manager_name: string | null; manager_cnpj: string | null; manager_sphere: string | null; managing_unit_name: string | null;
  supplier_name: string | null; supplier_cnpj: string | null; category_name: string | null;
  item_description: string | null; item_unit: string | null; item_quantity: string | null; item_unit_price: string | null;
  item_catalog: string | null; item_supplier_name: string | null; item_supplier_ni: string | null; items_count: number;
  source_name: string; rank: number;
}

export function parseSearch(sp: Record<string, string | string[] | undefined>): SearchParams {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v == null || v === "") continue;
    flat[k] = Array.isArray(v) ? (k === "status" ? v.join(",") : v[0]) : v;
  }
  return searchSchema.parse(flat);
}

export const PAGE_SIZE = 20;

/** Monta e executa a busca. Todos os valores vão como parâmetros ($n) — sem concatenação de entrada do usuário. */
export async function searchAtas(tx: Tx, p: SearchParams, opts: { pageSize?: number; ids?: string[] } = {}) {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = ["a.duplicate_of IS NULL"];
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const statuses = (p.status ?? "").split(",").map((s) => s.trim()).filter((s) => (PUBLIC_STATUSES as string[]).includes(s));
  where.push(`a.status = ANY(${add(statuses.length ? statuses : PUBLIC_STATUSES)})`);
  if (opts.ids) where.push(`a.id = ANY(${add(opts.ids)}::uuid[])`);

  // Item relacionado: vinculado à ata ou (sem vínculo informado) à contratação de origem
  const itemJoin = `(i.ata_id = a.id OR (i.ata_id IS NULL AND i.procurement_record_id = a.procurement_record_id))`;
  const itemConds: string[] = [];

  let tsq: string | null = null;
  const q = p.q?.trim();
  if (q) {
    tsq = add(q);
    const qd = onlyDigits(q);
    const numericLike = qd.length >= 4 && qd.length === q.replace(/[\s./-]/g, "").length;
    const numericCond = numericLike
      ? `OR a.ata_number ILIKE '%' || ${add(q)} || '%' OR a.external_id LIKE ${add(qd + "%")}
         OR a.id IN (SELECT a3.id FROM ata_items i JOIN price_registration_atas a3
                       ON (i.ata_id = a3.id OR (i.ata_id IS NULL AND i.procurement_record_id = a3.procurement_record_id))
                      WHERE i.catalog_code = ${add(qd)})`
      : "";
    where.push(`(a.search_tsv @@ websearch_to_tsquery('pt_unaccent', ${tsq})
      OR a.id IN (SELECT a2.id FROM ata_items i JOIN price_registration_atas a2
                    ON (i.ata_id = a2.id OR (i.ata_id IS NULL AND i.procurement_record_id = a2.procurement_record_id))
                   WHERE i.search_tsv @@ websearch_to_tsquery('pt_unaccent', ${tsq}))
      ${numericCond})`);
    itemConds.push(`(i.search_tsv @@ websearch_to_tsquery('pt_unaccent', ${tsq})${numericLike ? ` OR i.catalog_code = ${add(qd)}` : ""})`);
  }
  if (p.catalogo) {
    const c = add(onlyDigits(p.catalogo) || p.catalogo);
    where.push(`EXISTS (SELECT 1 FROM ata_items i WHERE ${itemJoin} AND i.catalog_code = ${c})`);
    itemConds.push(`i.catalog_code = ${c}`);
  }
  if (p.cnpj) {
    const c = add(onlyDigits(p.cnpj));
    where.push(`(s.cnpj = ${c} OR EXISTS (SELECT 1 FROM ata_items i WHERE ${itemJoin} AND i.supplier_ni = ${c}))`);
    itemConds.push(`(i.supplier_ni = ${c} OR i.supplier_ni IS NULL)`);
  }
  if (p.fornecedor) {
    const c = add(`%${p.fornecedor}%`);
    where.push(`(f_unaccent(s.legal_name) ILIKE f_unaccent(${c}) OR f_unaccent(coalesce(s.trade_name,'')) ILIKE f_unaccent(${c})
      OR EXISTS (SELECT 1 FROM ata_items i WHERE ${itemJoin} AND f_unaccent(i.supplier_name) ILIKE f_unaccent(${c})))`);
  }
  if (p.orgao) {
    const d = onlyDigits(p.orgao);
    if (d.length === 14) where.push(`g.cnpj = ${add(d)}`);
    else {
      const c = add(`%${p.orgao}%`);
      where.push(`(f_unaccent(g.name) ILIKE f_unaccent(${c}) OR f_unaccent(coalesce(a.managing_unit_name,'')) ILIKE f_unaccent(${c}))`);
    }
  }
  if (p.uf) where.push(`a.state = ${add(p.uf)}`);
  if (p.municipio) where.push(`f_unaccent(a.city) ILIKE f_unaccent(${add(p.municipio + "%")})`);
  if (p.somenteVigentes !== "0") where.push(`(a.validity_end IS NULL OR a.validity_end >= current_date) AND NOT a.cancelled`);
  if (p.vigenteAte) where.push(`a.validity_end >= ${add(p.vigenteAte)}::date`);
  if (p.categoria) where.push(`c.slug = ${add(p.categoria)}`);
  if (p.origem) where.push(`a.origin = ${add(p.origem)}`);
  const pmin = parseBrNumber(p.precoMin);
  const pmax = parseBrNumber(p.precoMax);
  if (pmin != null || pmax != null) {
    const conds = [pmin != null ? `i.unit_price >= ${add(pmin)}` : "", pmax != null ? `i.unit_price <= ${add(pmax)}` : ""]
      .filter(Boolean)
      .join(" AND ");
    where.push(`EXISTS (SELECT 1 FROM ata_items i WHERE ${itemJoin} AND ${conds}${itemConds.length ? " AND " + itemConds.join(" AND ") : ""})`);
    itemConds.push(conds);
  }

  const order = (() => {
    switch (p.ordem) {
      case "recentes": return "a.created_at DESC";
      case "vencimento": return "a.validity_end ASC NULLS LAST";
      case "preco": return "it.unit_price ASC NULLS LAST";
      default: return tsq ? "rank DESC, a.validity_end DESC NULLS LAST" : "a.featured DESC, a.created_at DESC";
    }
  })();
  const rankExpr = tsq
    ? `ts_rank(a.search_tsv, websearch_to_tsquery('pt_unaccent', ${tsq})) + CASE WHEN it.id IS NOT NULL THEN 0.5 ELSE 0 END`
    : "0";
  const page = p.pagina ?? 1;
  const joins = `LEFT JOIN suppliers s ON s.id = a.supplier_id
    LEFT JOIN government_entities g ON g.id = a.managing_entity_id
    LEFT JOIN categories c ON c.id = a.category_id`;

  const countRow = await tx.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM price_registration_atas a ${joins} WHERE ${where.join(" AND ")}`,
    params,
  );
  const rows = await tx.many<SearchResult>(
    `SELECT a.id, a.ata_number, a.year, a.object, a.status, a.origin, a.validity_start, a.validity_end, a.cancelled,
            a.city, a.state, a.source_url, a.original_document_url, a.managing_unit_name,
            g.name AS manager_name, g.cnpj AS manager_cnpj, g.sphere AS manager_sphere,
            s.legal_name AS supplier_name, s.cnpj AS supplier_cnpj, c.name AS category_name,
            it.description AS item_description, it.unit AS item_unit, it.quantity AS item_quantity, it.unit_price AS item_unit_price,
            it.catalog_code AS item_catalog, it.supplier_name AS item_supplier_name, it.supplier_ni AS item_supplier_ni,
            (SELECT count(*)::int FROM ata_items i WHERE ${itemJoin}) AS items_count,
            src.name AS source_name, ${rankExpr} AS rank
       FROM price_registration_atas a
       JOIN ata_sources src ON src.id = a.source_id
       ${joins}
       LEFT JOIN LATERAL (
         SELECT i.* FROM ata_items i WHERE ${itemJoin} ${itemConds.length ? "AND " + itemConds.join(" AND ") : ""}
         ORDER BY (i.unit_price IS NULL), i.item_number LIMIT 1) it ON true
      WHERE ${where.join(" AND ")}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  return { total: Number(countRow?.n ?? 0), rows, page, pageSize };
}

export function searchToQueryString(p: SearchParams, override: Record<string, string | number | undefined> = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...override })) if (v != null && v !== "") u.set(k, String(v));
  return u.toString();
}

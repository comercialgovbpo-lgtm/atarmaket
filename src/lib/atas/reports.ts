import "server-only";
import type { Tx } from "../db";
import { PUBLIC_STATUSES } from "./status";

export interface PriceStat { unit: string; n: number; atas: number; min: number; p25: number; median: number; p75: number; max: number; mean: number }
export interface PriceRow { ata_id: string; ata_number: string; manager: string | null; state: string | null; city: string | null; validity_end: string | null; description: string; unit: string | null; quantity: string | null; unit_price: string; supplier_name: string | null; status: string }

/**
 * Referência de preços registrados em atas públicas para um termo de busca.
 * Agrupa por unidade de fornecimento (preços de unidades diferentes não são comparáveis).
 */
export async function priceReport(tx: Tx, p: { q: string; uf?: string; onlyActive?: boolean; catalog?: string }) {
  const params: unknown[] = [p.q, PUBLIC_STATUSES];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where = [
    "i.unit_price IS NOT NULL AND i.unit_price > 0",
    "a.status = ANY($2) AND a.duplicate_of IS NULL",
    "(i.search_tsv @@ websearch_to_tsquery('pt_unaccent', $1))",
  ];
  if (p.uf) where.push(`a.state = ${add(p.uf)}`);
  if (p.onlyActive !== false) where.push("(a.validity_end IS NULL OR a.validity_end >= current_date) AND NOT a.cancelled AND a.status <> 'encerrada'");
  if (p.catalog) where.push(`i.catalog_code = ${add(p.catalog)}`);
  const from = `FROM ata_items i JOIN price_registration_atas a
                  ON (i.ata_id = a.id OR (i.ata_id IS NULL AND i.procurement_record_id = a.procurement_record_id))
                LEFT JOIN government_entities g ON g.id = a.managing_entity_id
               WHERE ${where.join(" AND ")}`;
  const stats = await tx.many<PriceStat>(
    `SELECT upper(coalesce(nullif(trim(i.unit), ''), 'NÃO INFORMADA')) AS unit, count(DISTINCT i.id)::int n, count(DISTINCT a.id)::int atas,
            min(i.unit_price)::float min, percentile_cont(0.25) WITHIN GROUP (ORDER BY i.unit_price)::float p25,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY i.unit_price)::float median, percentile_cont(0.75) WITHIN GROUP (ORDER BY i.unit_price)::float p75,
            max(i.unit_price)::float max, avg(i.unit_price)::float mean
       ${from} GROUP BY 1 ORDER BY n DESC LIMIT 12`, params);
  const rows = await tx.many<PriceRow>(
    `SELECT DISTINCT ON (i.id) a.id ata_id, a.ata_number, g.name manager, a.state, a.city, a.validity_end, i.description, i.unit, i.quantity, i.unit_price, i.supplier_name, a.status
       ${from} ORDER BY i.id LIMIT 500`, params);
  rows.sort((x, y) => Number(x.unit_price) - Number(y.unit_price));
  return { stats, rows };
}

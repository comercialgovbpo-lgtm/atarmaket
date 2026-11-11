import "server-only";
import type { Tx } from "../db";
import { PUBLIC_STATUSES } from "./status";

export async function platformStats(tx: Tx) {
  return tx.one<{ atas: number; vigentes: number; itens: number; fornecedores: number; orgaos: number; ufs: number }>(
    `SELECT (SELECT count(*)::int FROM price_registration_atas WHERE status = ANY($1)) AS atas,
            (SELECT count(*)::int FROM price_registration_atas WHERE status = ANY($1) AND status <> 'encerrada'
                AND NOT cancelled AND (validity_end IS NULL OR validity_end >= current_date)) AS vigentes,
            (SELECT count(*)::int FROM ata_items) AS itens,
            (SELECT count(*)::int FROM suppliers) AS fornecedores,
            (SELECT count(DISTINCT managing_entity_id)::int FROM price_registration_atas WHERE status = ANY($1)) AS orgaos,
            (SELECT count(DISTINCT state)::int FROM price_registration_atas WHERE status = ANY($1)) AS ufs`,
    [PUBLIC_STATUSES]);
}

export async function categoriesWithCounts(tx: Tx) {
  return tx.many<{ id: string; slug: string; name: string; icon: string | null; n: number }>(
    `SELECT c.id, c.slug, c.name, c.icon, count(a.id)::int AS n
       FROM categories c
       LEFT JOIN price_registration_atas a ON a.category_id = c.id AND a.status = ANY($1) AND a.status <> 'encerrada'
      WHERE c.active GROUP BY c.id ORDER BY c.sort_order`, [PUBLIC_STATUSES]);
}

export async function featuredSuppliers(tx: Tx, limit = 6) {
  return tx.many<{ id: string; legal_name: string; trade_name: string | null; city: string | null; state: string | null; account_linked: boolean; n: number }>(
    `WITH pub AS (SELECT id, supplier_id FROM price_registration_atas
                   WHERE status = ANY($1) AND status <> 'encerrada'),
          links AS (SELECT supplier_id AS sid, id AS aid FROM pub WHERE supplier_id IS NOT NULL
                    UNION SELECT i.supplier_id, i.ata_id FROM ata_items i JOIN pub ON pub.id = i.ata_id WHERE i.supplier_id IS NOT NULL)
     SELECT s.id, s.legal_name, s.trade_name, s.city, s.state, (s.organization_id IS NOT NULL) AS account_linked, count(*)::int AS n
       FROM links JOIN suppliers s ON s.id = links.sid
      GROUP BY s.id ORDER BY s.featured DESC, (s.organization_id IS NOT NULL) DESC, n DESC LIMIT $2`, [PUBLIC_STATUSES, limit]);
}

export interface AtaDetail {
  id: string; ata_number: string; year: number | null; object: string; status: string; origin: string; cancelled: boolean;
  process_number: string | null; procurement_reference: string | null; modality: string | null; uasg: string | null; managing_unit_name: string | null;
  signature_date: string | null; validity_start: string | null; validity_end: string | null; city: string | null; state: string | null;
  source_url: string | null; original_document_url: string | null; collected_at: Date | null; source_updated_at: Date | null; last_synced_at: Date | null;
  external_id: string | null; source_reported_adhesion: boolean | null; documents_verified: boolean; supplier_confirmed: boolean; validity_confirmed: boolean;
  availability_checked_at: Date | null; availability_note: string | null; created_at: Date; updated_at: Date; views_count: number;
  procurement_record_id: string | null; supplier_id: string | null; submitted_by_org_id: string | null; category_name: string | null; category_slug: string | null;
  source_name: string; source_code: string; source_docs_url: string | null;
  manager_id: string | null; manager_name: string | null; manager_cnpj: string | null; manager_sphere: string | null; manager_power: string | null;
  proc_external_id: string | null; proc_url: string | null; proc_object: string | null; proc_sync: Record<string, unknown> | null;
}

export async function getAtaDetail(tx: Tx, id: string) {
  const ata = await tx.one<AtaDetail>(
    `SELECT a.*, c.name AS category_name, c.slug AS category_slug, src.name AS source_name, src.code AS source_code, src.docs_url AS source_docs_url,
            g.id AS manager_id, g.name AS manager_name, g.cnpj AS manager_cnpj, g.sphere AS manager_sphere, g.power AS manager_power,
            p.external_id AS proc_external_id, p.source_url AS proc_url, p.object AS proc_object, p.raw->'_sync' AS proc_sync
       FROM price_registration_atas a
       JOIN ata_sources src ON src.id = a.source_id
       LEFT JOIN categories c ON c.id = a.category_id
       LEFT JOIN government_entities g ON g.id = a.managing_entity_id
       LEFT JOIN procurement_records p ON p.id = a.procurement_record_id
      WHERE a.id = $1`, [id]);
  if (!ata) return null;
  const [supplier, items, documents, history, changes, assessments] = await Promise.all([
    ata.supplier_id
      ? tx.one<{ id: string; cnpj: string; legal_name: string; trade_name: string | null; city: string | null; state: string | null; profile_description: string | null; website: string | null; public_email: string | null; public_phone: string | null; account_linked: boolean; company_size: string | null }>(
          "SELECT * FROM public_suppliers WHERE id = $1", [ata.supplier_id])
      : Promise.resolve(null),
    tx.many<{ id: string; item_number: number | null; catalog_type: string | null; catalog_code: string | null; material_or_service: string | null; description: string; unit: string | null; quantity: string | null; unit_price: string | null; total_price: string | null; supplier_id: string | null; supplier_ni: string | null; supplier_name: string | null; link_status: string }>(
      `SELECT id, item_number, catalog_type, catalog_code, material_or_service, description, unit, quantity, unit_price, total_price,
              supplier_id, supplier_ni, supplier_name, link_status
         FROM ata_items WHERE ata_id = $1 OR (ata_id IS NULL AND procurement_record_id = $2)
        ORDER BY item_number NULLS LAST, supplier_name LIMIT 1000`, [id, ata.procurement_record_id]),
    tx.many<{ id: string; kind: string; title: string; visibility: string; external_url: string | null; storage_path: string | null; published_at_source: Date | null; created_at: Date }>(
      `SELECT id, kind, title, visibility, external_url, storage_path, published_at_source, created_at FROM ata_documents
        WHERE ata_id = $1 OR (procurement_record_id = $2 AND ata_id IS NULL) ORDER BY kind, published_at_source NULLS LAST`, [id, ata.procurement_record_id]),
    tx.many<{ from_status: string | null; to_status: string; reason: string | null; created_at: Date }>(
      "SELECT from_status, to_status, reason, created_at FROM ata_status_history WHERE ata_id = $1 ORDER BY created_at DESC LIMIT 30", [id]),
    tx.many<{ origin: string; changes: Record<string, { de: unknown; para: unknown }>; created_at: Date }>(
      "SELECT origin, changes, created_at FROM ata_change_log WHERE ata_id = $1 ORDER BY created_at DESC LIMIT 20", [id]),
    tx.many<{ criteria: Record<string, { ok: boolean | null; note?: string }>; conclusion: string; caveats: string | null; created_at: Date; scope: string }>(
      "SELECT criteria, conclusion, caveats, created_at, scope FROM ata_adhesion_assessments WHERE ata_id = $1 ORDER BY created_at DESC LIMIT 5", [id]),
  ]);
  return { ata, supplier, items, documents, history, changes, assessments };
}

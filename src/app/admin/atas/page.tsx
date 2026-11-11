import Link from "next/link";
import { OriginBadge, StatusBadge } from "@/components/ata-bits";
import { Card, Input, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { STATUS_INFO } from "@/lib/atas/status";
import { dateBR, dateTimeBR } from "@/lib/format";
import { adminRead } from "../db";

export const metadata = { title: "Atas — administração" };

export default async function AdminAtas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = ["true"];
  if (sp.fila) where.push("a.status = 'em_validacao'");
  if (sp.status && sp.status in STATUS_INFO) where.push(`a.status = ${add(sp.status)}`);
  if (sp.origem === "fornecedor" || sp.origem === "fonte_publica") where.push(`a.origin = ${add(sp.origem)}`);
  if (sp.q) where.push(`(a.search_tsv @@ websearch_to_tsquery('pt_unaccent', ${add(sp.q)}) OR a.ata_number ILIKE ${add(`%${sp.q}%`)} OR a.external_id ILIKE ${add(`%${sp.q}%`)})`);
  if (sp.dup) where.push("(a.duplicate_of IS NOT NULL OR a.moderation_notes ILIKE '%duplicidade%')");
  const { rows, total } = await adminRead(async (tx) => ({
    total: Number((await tx.one<{ n: string }>(`SELECT count(*)::text n FROM price_registration_atas a WHERE ${where.join(" AND ")}`, params))?.n ?? 0),
    rows: await tx.many<{ id: string; ata_number: string; object: string; status: string; origin: string; validity_end: string | null; manager: string | null; org: string | null; updated_at: Date; duplicate_of: string | null; source_name: string }>(
      `SELECT a.id, a.ata_number, a.object, a.status, a.origin, a.validity_end, g.name manager, o.legal_name org, a.updated_at, a.duplicate_of, s.name source_name
         FROM price_registration_atas a JOIN ata_sources s ON s.id = a.source_id LEFT JOIN government_entities g ON g.id = a.managing_entity_id LEFT JOIN organizations o ON o.id = a.submitted_by_org_id
        WHERE ${where.join(" AND ")} ORDER BY ${sp.fila ? "a.status_updated_at ASC" : "a.updated_at DESC"} LIMIT 50 OFFSET ${(page - 1) * 50}`, params),
  }));
  const qs = (p: number) => `/admin/atas?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), pagina: String(p) })}`;
  return (
    <>
      <PageHeader title={sp.fila ? "Fila de validação" : "Atas"} description={`${total.toLocaleString("pt-BR")} registro(s)`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Número, objeto ou ID externo" className="w-72" />
        <Select name="status" defaultValue={sp.status ?? ""} className="w-52"><option value="">Todos os status</option>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select name="origem" defaultValue={sp.origem ?? ""} className="w-48"><option value="">Todas as origens</option><option value="fonte_publica">Fonte pública</option><option value="fornecedor">Fornecedor</option></Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dup" value="1" defaultChecked={Boolean(sp.dup)} />Possíveis duplicidades</label>
        <button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Filtrar</button>
      </form>
      <Card><Table>
        <thead><tr><Th>Ata</Th><Th>Origem</Th><Th>Órgão gerenciador</Th><Th>Enviada por</Th><Th>Status</Th><Th>Vigência</Th><Th>Atualizada</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <Td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/atas/${r.id}`}>{r.ata_number}</Link><p className="line-clamp-1 max-w-xs text-xs text-slate-500">{r.object}</p>{r.duplicate_of && <p className="text-[11px] text-red-600">Duplicada</p>}</Td>
            <Td><OriginBadge origin={r.origin} source={r.source_name} /></Td><Td className="max-w-48 truncate">{r.manager ?? "—"}</Td><Td className="max-w-40 truncate">{r.org ?? "—"}</Td>
            <Td><StatusBadge status={r.status} /></Td><Td>{dateBR(r.validity_end)}</Td><Td className="whitespace-nowrap text-xs">{dateTimeBR(r.updated_at)}</Td>
          </tr>))}</tbody>
      </Table></Card>
      <Pagination page={page} total={total} pageSize={50} href={qs} />
    </>
  );
}

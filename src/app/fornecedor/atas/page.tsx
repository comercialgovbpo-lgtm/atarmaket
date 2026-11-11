import Link from "next/link";
import { StatusBadge, ValidityBadge } from "@/components/ata-bits";
import { Card, Empty, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/plans";
import { dateBR } from "@/lib/format";

export const metadata = { title: "Minhas atas" };

export default async function MyAtas() {
  const { org } = await requireOrg("supplier");
  const { rows, ent } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    rows: await tx.many<{ id: string; ata_number: string; object: string; status: string; validity_end: string | null; cancelled: boolean; manager: string | null; origin: string; views_count: number; items: number; reqs: number }>(
      `SELECT a.id, a.ata_number, a.object, a.status, a.validity_end, a.cancelled, g.name AS manager, a.origin, a.views_count,
              (SELECT count(*)::int FROM ata_items i WHERE i.ata_id = a.id) items,
              (SELECT count(*)::int FROM contact_requests r WHERE r.ata_id = a.id) reqs
         FROM price_registration_atas a LEFT JOIN government_entities g ON g.id = a.managing_entity_id
        WHERE a.submitted_by_org_id = $1 OR a.supplier_id IN (SELECT app_supplier_ids())
        ORDER BY a.updated_at DESC`, [org.organization_id]),
  }));
  const used = rows.filter((r) => !["rascunho", "rejeitada", "encerrada"].includes(r.status) && r.origin === "fornecedor").length;
  return (
    <>
      <PageHeader title="Minhas atas" description={`Carteira de atas da empresa · ${used} de ${ent.ataLimit >= 100000 ? "∞" : ent.ataLimit} ata(s) do plano em uso`} actions={<LinkButton href="/fornecedor/atas/nova">Cadastrar ata</LinkButton>} />
      {rows.length === 0 ? <Empty title="Nenhuma ata cadastrada" action={<LinkButton href="/fornecedor/atas/nova">Cadastrar a primeira ata</LinkButton>}>Envie o PDF da ata para preenchimento automático ou cadastre manualmente.</Empty> : (
        <Card><Table>
          <thead><tr><Th>Ata</Th><Th>Órgão gerenciador</Th><Th>Status</Th><Th>Vigência</Th><Th className="text-right">Itens</Th><Th className="text-right">Visualizações</Th><Th className="text-right">Solicitações</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td><Link href={`/fornecedor/atas/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.ata_number}</Link><p className="line-clamp-1 max-w-xs text-xs text-slate-500">{r.object}</p>{r.origin !== "fornecedor" && <p className="text-[11px] text-slate-400">Importada de fonte pública</p>}</Td>
              <Td className="max-w-56 truncate">{r.manager ?? "—"}</Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td><ValidityBadge end={r.validity_end} cancelled={r.cancelled} status={r.status} /><p className="mt-0.5 text-xs text-slate-500">até {dateBR(r.validity_end)}</p></Td>
              <Td className="text-right tabular">{r.items}</Td><Td className="text-right tabular">{r.views_count}</Td><Td className="text-right tabular">{r.reqs}</Td>
            </tr>))}</tbody>
        </Table></Card>
      )}
    </>
  );
}

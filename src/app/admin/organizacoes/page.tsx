import { Badge, Card, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { dateBR, formatCnpj } from "@/lib/format";
import { verifyOrgAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Fornecedores e órgãos" };

export default async function Orgs({ searchParams }: { searchParams: Promise<{ tipo?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await adminRead((tx) => tx.many<{ id: string; kind: string; cnpj: string; legal_name: string; email: string | null; city: string | null; state: string | null; sphere: string | null; verification_status: string; verification_notes: string | null; created_at: Date; members: number; plan: string | null; atas: number }>(
    `SELECT o.*, (SELECT count(*)::int FROM organization_members m WHERE m.organization_id = o.id) members,
            (SELECT p.name FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.organization_id = o.id AND s.status = 'ativa' ORDER BY s.created_at DESC LIMIT 1) plan,
            (SELECT count(*)::int FROM price_registration_atas a WHERE a.submitted_by_org_id = o.id) atas
       FROM organizations o
      WHERE ($1::text IS NULL OR o.kind = $1) AND ($2::text IS NULL OR o.verification_status = $2)
        AND ($3::text IS NULL OR f_unaccent(o.legal_name) ILIKE f_unaccent('%' || $3 || '%') OR o.cnpj LIKE regexp_replace($3, '\\D', '', 'g') || '%')
      ORDER BY o.created_at DESC LIMIT 200`, [sp.tipo || null, sp.status || null, sp.q || null]));
  return (
    <>
      <PageHeader title="Fornecedores e órgãos" description="Validação institucional e de titularidade das contas." />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Nome ou CNPJ" className="w-64" />
        <Select name="tipo" defaultValue={sp.tipo ?? ""} className="w-40"><option value="">Todos</option><option value="supplier">Fornecedores</option><option value="government">Órgãos</option></Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-40"><option value="">Qualquer status</option><option value="pending">Pendente</option><option value="verified">Verificada</option><option value="rejected">Rejeitada</option></Select>
        <button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Filtrar</button>
      </form>
      <Card><Table>
        <thead><tr><Th>Organização</Th><Th>Tipo</Th><Th>Plano</Th><Th>Usuários / atas</Th><Th>Verificação</Th><Th>Ação</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((o) => (
          <tr key={o.id}>
            <Td><p className="font-medium text-slate-900">{o.legal_name}</p><p className="text-xs text-slate-500">{formatCnpj(o.cnpj)} · {o.city}/{o.state} · {o.email} · desde {dateBR(o.created_at)}</p>{o.verification_notes && <p className="text-xs text-amber-700">{o.verification_notes}</p>}</Td>
            <Td>{o.kind === "supplier" ? "Fornecedor" : `Órgão ${o.sphere ?? ""}`}</Td><Td>{o.plan ?? "—"}</Td><Td>{o.members} / {o.atas}</Td>
            <Td><Badge tone={o.verification_status === "verified" ? "green" : o.verification_status === "rejected" ? "red" : "amber"}>{o.verification_status}</Badge></Td>
            <Td><form action={verifyOrgAction} className="flex flex-wrap gap-1"><input type="hidden" name="id" value={o.id} />
              <input name="notes" placeholder="Nota" className="h-8 w-32 rounded border border-slate-300 px-2 text-xs" />
              <button name="status" value="verified" className="h-8 rounded bg-ok-600 px-2 text-xs text-white">Verificar</button>
              <button name="status" value="rejected" className="h-8 rounded border border-red-300 px-2 text-xs text-red-700">Rejeitar</button></form></Td>
          </tr>))}</tbody>
      </Table></Card>
    </>
  );
}

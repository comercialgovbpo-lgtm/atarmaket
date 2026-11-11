import { Badge, Card, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { dateTimeBR } from "@/lib/format";
import { userAdminAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Usuários" };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const rows = await adminRead((tx) => tx.many<{ id: string; email: string; full_name: string; platform_role: string; status: string; last_login_at: Date | null; created_at: Date; orgs: string | null }>(
    `SELECT u.id, u.email, u.full_name, u.platform_role, u.status, u.last_login_at, u.created_at,
            (SELECT string_agg(o.legal_name || ' (' || m.role || ')', ', ') FROM organization_members m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = u.id) orgs
       FROM users u WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR f_unaccent(u.full_name) ILIKE f_unaccent('%' || $1 || '%'))
      ORDER BY u.created_at DESC LIMIT 200`, [sp.q || null]));
  return (
    <>
      <PageHeader title="Usuários" />
      <form className="mb-4 flex gap-2"><Input name="q" defaultValue={sp.q} placeholder="Nome ou e-mail" className="w-72" /><button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Buscar</button></form>
      <Card><Table>
        <thead><tr><Th>Usuário</Th><Th>Organizações</Th><Th>Papel</Th><Th>Status</Th><Th>Último acesso</Th><Th></Th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((u) => (
          <tr key={u.id}><Td><p className="font-medium">{u.full_name}</p><p className="text-xs text-slate-500">{u.email}</p></Td><Td className="max-w-xs text-xs">{u.orgs ?? "—"}</Td>
            <Td>{u.platform_role === "admin" ? <Badge tone="navy">Admin</Badge> : "Usuário"}</Td><Td><Badge tone={u.status === "active" ? "green" : "red"}>{u.status}</Badge></Td><Td className="text-xs">{dateTimeBR(u.last_login_at)}</Td>
            <Td><form action={userAdminAction} className="flex gap-1"><input type="hidden" name="id" value={u.id} />
              {u.status === "active" ? <button name="op" value="suspender" className="text-xs text-red-600 hover:underline">Suspender</button> : u.status === "suspended" && <button name="op" value="reativar" className="text-xs text-brand-700 hover:underline">Reativar</button>}
              {u.platform_role === "admin" ? <button name="op" value="rebaixar" className="ml-2 text-xs text-slate-600 hover:underline">Remover admin</button> : <button name="op" value="promover" className="ml-2 text-xs text-slate-600 hover:underline">Tornar admin</button>}</form></Td></tr>
        ))}</tbody>
      </Table></Card>
    </>
  );
}

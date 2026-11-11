import { Card, Input, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { dateTimeBR } from "@/lib/format";
import { adminRead } from "../db";

export const metadata = { title: "Auditoria" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ acao?: string; entidade?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const { rows, total } = await adminRead(async (tx) => ({
    total: Number((await tx.one<{ n: string }>("SELECT count(*)::text n FROM audit_logs WHERE ($1::text IS NULL OR action ILIKE $1 || '%') AND ($2::text IS NULL OR entity_id = $2)", [sp.acao || null, sp.entidade || null]))?.n ?? 0),
    rows: await tx.many<{ id: string; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown>; created_at: Date; actor_role: string | null; who: string | null }>(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.metadata, l.created_at, l.actor_role, u.email who FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
        WHERE ($1::text IS NULL OR l.action ILIKE $1 || '%') AND ($2::text IS NULL OR l.entity_id = $2) ORDER BY l.created_at DESC LIMIT 100 OFFSET $3`, [sp.acao || null, sp.entidade || null, (page - 1) * 100]),
  }));
  return (
    <>
      <PageHeader title="Logs de auditoria" description={`${total.toLocaleString("pt-BR")} evento(s). Registros imutáveis pela aplicação.`} />
      <form className="mb-4 flex gap-2"><Input name="acao" defaultValue={sp.acao} placeholder="Ação (prefixo)" className="w-56" /><Input name="entidade" defaultValue={sp.entidade} placeholder="ID da entidade" className="w-80" /><button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Filtrar</button></form>
      <Card><Table><thead><tr><Th>Data</Th><Th>Ator</Th><Th>Ação</Th><Th>Entidade</Th><Th>Detalhes</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-xs">{dateTimeBR(r.created_at)}</Td><Td className="text-xs">{r.who ?? r.actor_role ?? "sistema"}</Td><Td>{r.action}</Td><Td className="text-xs">{r.entity_type} {r.entity_id}</Td><Td className="max-w-sm truncate font-mono text-[11px]">{JSON.stringify(r.metadata)}</Td></tr>)}</tbody></Table></Card>
      <Pagination page={page} total={total} pageSize={100} href={(p) => `/admin/auditoria?${new URLSearchParams({ ...(sp.acao ? { acao: sp.acao } : {}), ...(sp.entidade ? { entidade: sp.entidade } : {}), pagina: String(p) })}`} />
    </>
  );
}

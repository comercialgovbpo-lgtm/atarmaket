import Link from "next/link";
import { UpgradeNotice } from "@/components/gate";
import { Card, CardHeader, Empty, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { dateTimeBR } from "@/lib/format";
import { deleteSavedSearchAction } from "../actions";

export const metadata = { title: "Pesquisas salvas" };
const toQs = (q: Record<string, unknown>) => new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString();
const describe = (q: Record<string, unknown>) => Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "Todas as atas";

export default async function Searches({ searchParams }: { searchParams: Promise<{ salva?: string }> }) {
  const { user, org } = await requireOrg("government");
  const sp = await searchParams;
  const { ent, saved, history } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    saved: await tx.many<{ id: string; name: string; query: Record<string, unknown>; created_at: Date; alert: boolean }>(
      "SELECT s.id, s.name, s.query, s.created_at, EXISTS(SELECT 1 FROM alerts a WHERE a.saved_search_id = s.id AND a.active) AS alert FROM saved_searches s WHERE s.user_id = $1 ORDER BY s.created_at DESC", [user.id]),
    history: await tx.many<{ query: Record<string, unknown>; results_count: number; created_at: Date }>(
      "SELECT query, results_count, created_at FROM search_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [user.id]),
  }));
  return (
    <>
      <PageHeader title="Pesquisas salvas e histórico" description="Salve pesquisas a partir da página de busca e receba avisos quando novas atas corresponderem a elas." />
      {sp.salva && <Notice tone="green" className="mb-4">Pesquisa salva.</Notice>}
      {!has(ent, "saved_searches") ? <UpgradeNotice feature="saved_searches" href="/orgao/licenca" /> : (
        <Card className="mb-6">
          <CardHeader title="Pesquisas salvas" />
          {saved.length === 0 ? <div className="p-5"><Empty title="Nenhuma pesquisa salva">Faça uma busca e use “Salvar pesquisa”.</Empty></div> : (
            <ul className="divide-y divide-slate-100">
              {saved.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0"><Link href={`/atas?${toQs(s.query)}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link><p className="truncate text-xs text-slate-500">{describe(s.query)}{s.alert ? " · alerta ativo" : ""}</p></div>
                  <form action={deleteSavedSearchAction}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-600 hover:underline">Excluir</button></form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {has(ent, "search_history") && (
        <Card>
          <CardHeader title="Histórico de pesquisas" description="Últimas 50 pesquisas realizadas com seu usuário" />
          <Table><thead><tr><Th>Data</Th><Th>Critérios</Th><Th className="text-right">Resultados</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">{history.map((h, i) => (
              <tr key={i}><Td className="whitespace-nowrap">{dateTimeBR(h.created_at)}</Td><Td><Link href={`/atas?${toQs(h.query)}`} className="text-brand-700 hover:underline">{describe(h.query)}</Link></Td><Td className="text-right tabular">{h.results_count}</Td></tr>
            ))}</tbody></Table>
        </Card>
      )}
    </>
  );
}

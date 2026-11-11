import Link from "next/link";
import { BarList, ColumnChart } from "@/components/charts";
import { UpgradeNotice } from "@/components/gate";
import { Card, CardHeader, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { OPPORTUNITY_STATUS } from "@/lib/atas/status";
import { brl, dateBR } from "@/lib/format";

export const metadata = { title: "Relatórios" };

export default async function SupplierReports({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { org } = await requireOrg("supplier");
  const days = [30, 90, 365].includes(Number((await searchParams).dias)) ? Number((await searchParams).dias) : 90;
  const d = await userDb(async (tx) => {
    const ent = await getEntitlements(tx, org.organization_id);
    if (!has(ent, "advanced_reports")) return { ent };
    const own = "(a.submitted_by_org_id = $1 OR a.supplier_id IN (SELECT app_supplier_ids()))";
    const perAta = await tx.many<{ id: string; ata_number: string; status: string; validity_end: string | null; views: number; reqs: number; opps: number; won: number }>(
      `SELECT a.id, a.ata_number, a.status, a.validity_end,
              (SELECT count(*)::int FROM ata_view_events v WHERE v.ata_id = a.id AND v.created_at > now() - make_interval(days => $2)) views,
              (SELECT count(*)::int FROM contact_requests r WHERE r.ata_id = a.id AND r.created_at > now() - make_interval(days => $2)) reqs,
              (SELECT count(*)::int FROM commercial_opportunities o WHERE o.ata_id = a.id AND o.supplier_org_id = $1) opps,
              (SELECT count(*)::int FROM commercial_opportunities o WHERE o.ata_id = a.id AND o.supplier_org_id = $1 AND o.status = 'convertido') won
         FROM price_registration_atas a WHERE ${own} ORDER BY views DESC`, [org.organization_id, days]);
    const views = await tx.many<{ label: string; value: number }>(
      `SELECT to_char(w, 'DD/MM') label, coalesce(c.n,0)::int value
         FROM generate_series(date_trunc('week', now() - make_interval(days => $2)), date_trunc('week', now()), interval '1 week') w
         LEFT JOIN (SELECT date_trunc('week', v.created_at) wk, count(*) n FROM ata_view_events v JOIN price_registration_atas a ON a.id = v.ata_id
                     WHERE ${own} AND v.created_at > now() - make_interval(days => $2) GROUP BY 1) c ON c.wk = w ORDER BY w`, [org.organization_id, days]);
    const funnel = await tx.many<{ status: string; n: number; value: string | null }>(
      "SELECT status, count(*)::int n, sum(estimated_value)::text value FROM commercial_opportunities WHERE supplier_org_id = $1 GROUP BY status", [org.organization_id]);
    const viewers = await tx.many<{ label: string; value: number }>(
      `SELECT CASE v.viewer_kind WHEN 'orgao' THEN 'Órgãos públicos' WHEN 'fornecedor' THEN 'Fornecedores' WHEN 'anonimo' THEN 'Visitantes sem login' ELSE 'Administração' END label, count(*)::int value
         FROM ata_view_events v JOIN price_registration_atas a ON a.id = v.ata_id WHERE ${own} AND v.created_at > now() - make_interval(days => $2) GROUP BY 1 ORDER BY 2 DESC`, [org.organization_id, days]);
    return { ent, perAta, views, funnel, viewers };
  });
  if (!("perAta" in d) || !d.perAta) return <><PageHeader title="Relatórios" /><UpgradeNotice feature="advanced_reports" href="/fornecedor/assinatura" /></>;
  const total = (k: "views" | "reqs") => d.perAta!.reduce((s, r) => s + r[k], 0);
  const opps = d.funnel!.reduce((s, f) => s + f.n, 0);
  const won = d.funnel!.find((f) => f.status === "convertido");
  return (
    <>
      <PageHeader title="Relatórios da carteira" description="Desempenho das atas no marketplace e evolução comercial."
        actions={<div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">{[30, 90, 365].map((p) => <Link key={p} href={`/fornecedor/relatorios?dias=${p}`} className={`rounded-md px-3 py-1 ${p === days ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{p === 365 ? "12 meses" : `${p} dias`}</Link>)}</div>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Visualizações" value={total("views")} hint={`Últimos ${days} dias`} />
        <Stat label="Solicitações" value={total("reqs")} hint={`Últimos ${days} dias`} />
        <Stat label="Oportunidades no CRM" value={opps} />
        <Stat label="Taxa de conversão" value={opps ? `${(((won?.n ?? 0) / opps) * 100).toFixed(1)}%` : "—"} hint={won?.value ? `${brl(won.value)} convertidos` : undefined} tone="green" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Visualizações por semana" /><div className="p-5"><ColumnChart data={d.views!} label="Visualizações por semana" /></div></Card>
        <Card><CardHeader title="Quem visualizou" /><div className="p-5">{d.viewers!.length ? <BarList data={d.viewers!} /> : <p className="text-sm text-slate-500">Sem visualizações no período.</p>}</div></Card>
        <Card className="lg:col-span-2"><CardHeader title="Funil comercial" />
          <div className="p-5"><BarList data={Object.entries(OPPORTUNITY_STATUS).map(([k, l]) => ({ label: l, value: d.funnel!.find((f) => f.status === k)?.n ?? 0 }))} /></div>
        </Card>
      </div>
      <Card className="mt-6"><CardHeader title="Desempenho por ata" />
        <Table><thead><tr><Th>Ata</Th><Th>Status</Th><Th>Vigência</Th><Th className="text-right">Visualizações</Th><Th className="text-right">Solicitações</Th><Th className="text-right">Oportunidades</Th><Th className="text-right">Convertidas</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{d.perAta.map((r) => (
            <tr key={r.id}><Td><Link className="text-brand-700 hover:underline" href={`/fornecedor/atas/${r.id}`}>{r.ata_number}</Link></Td><Td>{r.status.replaceAll("_", " ")}</Td><Td>{dateBR(r.validity_end)}</Td>
              <Td className="text-right tabular">{r.views}</Td><Td className="text-right tabular">{r.reqs}</Td><Td className="text-right tabular">{r.opps}</Td><Td className="text-right tabular">{r.won}</Td></tr>))}</tbody></Table>
      </Card>
    </>
  );
}

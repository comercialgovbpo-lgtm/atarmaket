import Link from "next/link";
import { ColumnChart } from "@/components/charts";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { brl } from "@/lib/format";
import { adminRead } from "./db";

export const metadata = { title: "Indicadores" };
const PERIODS = [7, 30, 90, 365];

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const days = PERIODS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const d = await adminRead(async (tx) => {
    const k = await tx.one<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM price_registration_atas WHERE duplicate_of IS NULL) total,
              (SELECT count(*)::int FROM price_registration_atas WHERE status NOT IN ('encerrada','rascunho','rejeitada','em_validacao') AND NOT cancelled AND (validity_end IS NULL OR validity_end >= current_date)) vigentes,
              (SELECT count(*)::int FROM price_registration_atas WHERE status = 'encerrada' OR validity_end < current_date) expiradas,
              (SELECT count(*)::int FROM price_registration_atas WHERE documents_verified OR status IN ('verificada','fornecedor_confirmado','vigencia_confirmada','disponibilidade_consultada')) verificadas,
              (SELECT count(*)::int FROM price_registration_atas WHERE status = 'em_validacao') fila,
              (SELECT count(*)::int FROM organizations WHERE kind = 'supplier') forn,
              (SELECT count(DISTINCT s.organization_id)::int FROM subscriptions s JOIN organizations o ON o.id = s.organization_id WHERE o.kind = 'supplier' AND s.status = 'ativa' AND s.price_cents > 0 AND (s.current_period_end IS NULL OR s.current_period_end > now())) forn_pag,
              (SELECT count(*)::int FROM organizations WHERE kind = 'government') orgaos,
              (SELECT count(DISTINCT s.organization_id)::int FROM subscriptions s JOIN organizations o ON o.id = s.organization_id WHERE o.kind = 'government' AND s.status = 'ativa' AND s.price_cents > 0 AND (s.current_period_end IS NULL OR s.current_period_end > now())) orgaos_lic,
              (SELECT count(*)::int FROM search_logs WHERE created_at > now() - make_interval(days => $1)) pesquisas,
              (SELECT count(*)::int FROM contact_requests WHERE created_at > now() - make_interval(days => $1)) contatos,
              (SELECT coalesce(sum(CASE WHEN p.billing_interval = 'month' THEN s.price_cents ELSE s.price_cents / 12.0 END),0)::float FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.status = 'ativa' AND (s.current_period_end IS NULL OR s.current_period_end > now())) mrr,
              (SELECT count(*)::int FROM commercial_opportunities WHERE created_at > now() - make_interval(days => $1)) opp,
              (SELECT count(*)::int FROM commercial_opportunities WHERE status = 'convertido' AND updated_at > now() - make_interval(days => $1)) opp_conv,
              (SELECT count(*)::int FROM supplier_claims WHERE status = 'pendente') claims`, [days]);
    const series = async (table: string) => tx.many<{ label: string; value: number }>(
      `SELECT to_char(d, 'DD/MM') AS label, coalesce(c.n, 0)::int AS value
         FROM generate_series((current_date - ($1::int - 1)), current_date, interval '1 day') d
         LEFT JOIN (SELECT created_at::date AS day, count(*) n FROM ${table} WHERE created_at > now() - make_interval(days => $1) GROUP BY 1) c ON c.day = d::date
        ORDER BY d`, [Math.min(days, 90)]);
    return { k: k!, searches: await series("search_logs"), atas: await series("price_registration_atas"), contacts: await series("contact_requests") };
  });
  const { k } = d;
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
  return (
    <>
      <PageHeader title="Indicadores da plataforma" actions={
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">{PERIODS.map((p) => <Link key={p} href={`/admin?dias=${p}`} className={`rounded-md px-3 py-1 ${p === days ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{p === 365 ? "12 meses" : `${p} dias`}</Link>)}</div>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Atas na base" value={k.total.toLocaleString("pt-BR")} />
        <Stat label="Atas vigentes" value={k.vigentes.toLocaleString("pt-BR")} tone="green" />
        <Stat label="Atas expiradas" value={k.expiradas.toLocaleString("pt-BR")} />
        <Stat label="Atas verificadas" value={k.verificadas.toLocaleString("pt-BR")} hint={<Link href="/admin/atas?fila=1" className="text-brand-700 hover:underline">{k.fila} na fila de validação</Link>} />
        <Stat label="Fornecedores cadastrados" value={k.forn} />
        <Stat label="Fornecedores pagantes" value={k.forn_pag} hint={`Conversão ${pct(k.forn_pag, k.forn)}`} tone="green" />
        <Stat label="Órgãos cadastrados" value={k.orgaos} />
        <Stat label="Órgãos licenciados" value={k.orgaos_lic} hint={`Conversão ${pct(k.orgaos_lic, k.orgaos)}`} tone="green" />
        <Stat label="Pesquisas realizadas" value={k.pesquisas.toLocaleString("pt-BR")} hint={`Últimos ${days} dias`} />
        <Stat label="Solicitações de contato" value={k.contatos} hint={`Últimos ${days} dias`} />
        <Stat label="Receita recorrente mensal" value={brl(k.mrr / 100, 0)} />
        <Stat label="Receita recorrente anual" value={brl((k.mrr * 12) / 100, 0)} />
        <Stat label="Taxa de conversão (CRM)" value={pct(k.opp_conv, k.opp)} hint={`${k.opp_conv} de ${k.opp} oportunidades no período`} />
        <Stat label="Reivindicações pendentes" value={<Link href="/admin/reivindicacoes" className="hover:underline">{k.claims}</Link>} tone={k.claims ? "amber" : undefined} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card><CardHeader title="Pesquisas por dia" /><div className="p-5"><ColumnChart data={d.searches} label="Pesquisas por dia" /></div></Card>
        <Card><CardHeader title="Novas atas por dia" /><div className="p-5"><ColumnChart data={d.atas} label="Novas atas por dia" /></div></Card>
        <Card><CardHeader title="Solicitações de contato por dia" /><div className="p-5"><ColumnChart data={d.contacts} label="Solicitações por dia" /></div></Card>
      </div>
    </>
  );
}

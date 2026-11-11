import Link from "next/link";
import { StatusBadge } from "@/components/ata-bits";
import { Badge, Card, CardHeader, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/plans";
import { CONTACT_STATUS } from "@/lib/atas/status";
import { dateBR, daysUntil } from "@/lib/format";

export const metadata = { title: "Painel do órgão" };

export default async function GovDashboard({ searchParams }: { searchParams: Promise<{ bemvindo?: string }> }) {
  const { user, org } = await requireOrg("government");
  const sp = await searchParams;
  const d = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    counts: await tx.one<{ fav: number; saved: number; req: number; alerts: number; opp: number }>(
      `SELECT (SELECT count(*)::int FROM favorites WHERE user_id = $1) fav,
              (SELECT count(*)::int FROM saved_searches WHERE user_id = $1) saved,
              (SELECT count(*)::int FROM contact_requests WHERE requester_org_id = $2) req,
              (SELECT count(*)::int FROM alerts WHERE user_id = $1 AND active) alerts,
              (SELECT count(*)::int FROM favorites WHERE user_id = $1 AND stage IN ('em_analise','consulta_enviada','encaminhada')) opp`, [user.id, org.organization_id]),
    recentSearches: await tx.many<{ query: Record<string, string>; results_count: number; created_at: Date }>(
      "SELECT query, results_count, created_at FROM search_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 6", [user.id]),
    expiring: await tx.many<{ id: string; ata_number: string; object: string; validity_end: string; status: string }>(
      `SELECT a.id, a.ata_number, a.object, a.validity_end, a.status FROM favorites f JOIN price_registration_atas a ON a.id = f.ata_id
        WHERE f.user_id = $1 AND a.validity_end BETWEEN current_date AND current_date + 60 ORDER BY a.validity_end LIMIT 6`, [user.id]),
    favs: await tx.many<{ id: string; ata_number: string; object: string; status: string; stage: string }>(
      `SELECT a.id, a.ata_number, a.object, a.status, f.stage FROM favorites f JOIN price_registration_atas a ON a.id = f.ata_id
        WHERE f.user_id = $1 ORDER BY f.created_at DESC LIMIT 5`, [user.id]),
    requests: await tx.many<{ id: string; ata_id: string; ata_number: string; status: string; created_at: Date }>(
      `SELECT r.id, r.ata_id, a.ata_number, r.status, r.created_at FROM contact_requests r JOIN price_registration_atas a ON a.id = r.ata_id
        WHERE r.requester_org_id = $1 ORDER BY r.created_at DESC LIMIT 5`, [org.organization_id]),
  }));
  const q = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([k, v]) => v && k !== "pagina")).toString();
  return (
    <>
      <PageHeader title={`Olá, ${user.full_name.split(" ")[0]}`} description="Acompanhe pesquisas, atas de interesse e solicitações enviadas a fornecedores." />
      {sp.bemvindo && <Notice tone="green" className="mb-4" title="Cadastro realizado">Seu acesso institucional está ativo. A validação do vínculo com o órgão será feita pela equipe da plataforma.</Notice>}
      {org.verification_status !== "verified" && <Notice tone="amber" className="mb-4">Validação institucional pendente. Algumas ações podem exigir confirmação do vínculo.</Notice>}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Licença:</span>
        {d.ent.planName ? <Badge tone="green">{d.ent.planName}{d.ent.periodEnd ? ` · até ${dateBR(d.ent.periodEnd)}` : ""}</Badge> : <Badge tone="gray">Sem licença ativa — busca básica</Badge>}
        <Link href="/orgao/licenca" className="text-brand-700 hover:underline">Gerenciar</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Atas favoritas" value={d.counts?.fav ?? 0} />
        <Stat label="Oportunidades em análise" value={d.counts?.opp ?? 0} />
        <Stat label="Pesquisas salvas" value={d.counts?.saved ?? 0} />
        <Stat label="Solicitações enviadas" value={d.counts?.req ?? 0} />
        <Stat label="Alertas ativos" value={d.counts?.alerts ?? 0} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alertas de vencimento" description="Atas favoritas que vencem nos próximos 60 dias" />
          {d.expiring.length ? <ul className="divide-y divide-slate-100">{d.expiring.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <Link href={`/atas/${a.id}`} className="min-w-0 truncate text-brand-700 hover:underline">Ata {a.ata_number} — {a.object}</Link>
              <Badge tone="amber">{daysUntil(a.validity_end)} dias</Badge>
            </li>))}</ul> : <p className="p-5 text-sm text-slate-500">Nenhuma ata favorita próxima do vencimento.</p>}
        </Card>
        <Card>
          <CardHeader title="Pesquisas recentes" />
          {d.recentSearches.length ? <ul className="divide-y divide-slate-100">{d.recentSearches.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <Link href={`/atas?${q(s.query)}`} className="truncate text-brand-700 hover:underline">{s.query.q ?? Object.values(s.query).join(" · ") ?? "Pesquisa"}</Link>
              <span className="whitespace-nowrap text-xs text-slate-500">{s.results_count} resultado(s)</span>
            </li>))}</ul> : <div className="p-5"><Empty title="Nenhuma pesquisa ainda"><Link href="/atas" className="text-brand-700 underline">Pesquisar atas</Link></Empty></div>}
        </Card>
        <Card>
          <CardHeader title="Atas favoritas" action={<Link href="/orgao/favoritos" className="text-sm text-brand-700 hover:underline">Ver todas</Link>} />
          {d.favs.length ? <ul className="divide-y divide-slate-100">{d.favs.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <Link href={`/atas/${a.id}`} className="min-w-0 truncate text-brand-700 hover:underline">Ata {a.ata_number} — {a.object}</Link><StatusBadge status={a.status} />
            </li>))}</ul> : <p className="p-5 text-sm text-slate-500">Favorite atas para acompanhá-las aqui.</p>}
        </Card>
        <Card>
          <CardHeader title="Solicitações enviadas" action={<Link href="/orgao/solicitacoes" className="text-sm text-brand-700 hover:underline">Ver todas</Link>} />
          {d.requests.length ? <ul className="divide-y divide-slate-100">{d.requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <Link href={`/atas/${r.ata_id}`} className="text-brand-700 hover:underline">Ata {r.ata_number}</Link>
              <span className="text-xs text-slate-500">{CONTACT_STATUS[r.status]} · {dateBR(r.created_at)}</span>
            </li>))}</ul> : <p className="p-5 text-sm text-slate-500">Nenhuma solicitação enviada.</p>}
        </Card>
      </div>
    </>
  );
}

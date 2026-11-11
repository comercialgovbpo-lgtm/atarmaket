import Link from "next/link";
import { StatusBadge } from "@/components/ata-bits";
import { BarList } from "@/components/charts";
import { Badge, Card, CardHeader, LinkButton, Notice, PageHeader, Stat } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { dateBR, daysUntil } from "@/lib/format";

export const metadata = { title: "Painel do fornecedor" };

export default async function SupplierDashboard() {
  const { org } = await requireOrg("supplier");
  const d = await userDb(async (tx) => {
    const ent = await getEntitlements(tx, org.organization_id);
    const own = `(a.submitted_by_org_id = $1 OR a.supplier_id IN (SELECT app_supplier_ids()))`;
    const c = await tx.one<{ total: number; vigentes: number; pendentes: number; vencendo: number; views: number; views30: number; reqs: number; contatos: number }>(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE a.status NOT IN ('encerrada','rascunho','rejeitada','em_validacao') AND (a.validity_end IS NULL OR a.validity_end >= current_date))::int vigentes,
              count(*) FILTER (WHERE a.status = 'em_validacao')::int pendentes,
              count(*) FILTER (WHERE a.validity_end BETWEEN current_date AND current_date + 60 AND a.status <> 'encerrada')::int vencendo,
              coalesce(sum(a.views_count),0)::int views,
              (SELECT count(*)::int FROM ata_view_events v WHERE v.ata_id IN (SELECT id FROM price_registration_atas a WHERE ${own}) AND v.created_at > now() - interval '30 days') views30,
              (SELECT count(*)::int FROM contact_requests r WHERE r.supplier_id IN (SELECT app_supplier_ids())) reqs,
              (SELECT count(*)::int FROM commercial_opportunities o WHERE o.supplier_org_id = $1 AND o.status <> 'novo_interessado') contatos
         FROM price_registration_atas a WHERE ${own}`, [org.organization_id]);
    const expiring = await tx.many<{ id: string; ata_number: string; validity_end: string; status: string }>(
      `SELECT id, ata_number, validity_end, status FROM price_registration_atas a WHERE ${own} AND validity_end BETWEEN current_date AND current_date + 90 AND status <> 'encerrada' ORDER BY validity_end LIMIT 6`, [org.organization_id]);
    const top = has(ent, "view_stats") ? await tx.many<{ label: string; value: number }>(
      `SELECT 'Ata ' || ata_number AS label, views_count AS value FROM price_registration_atas a WHERE ${own} ORDER BY views_count DESC LIMIT 6`, [org.organization_id]) : [];
    const claims = await tx.many<{ status: string }>("SELECT status FROM supplier_claims WHERE claimant_org_id = $1 ORDER BY created_at DESC LIMIT 1", [org.organization_id]);
    return { ent, c, expiring, top, claim: claims[0]?.status ?? null };
  });
  return (
    <>
      <PageHeader title="Visão geral" description="Acompanhe suas atas, visualizações e interessados." actions={<LinkButton href="/fornecedor/atas/nova">Cadastrar ata</LinkButton>} />
      {!d.ent.planCode && <Notice tone="blue" className="mb-4" title="Escolha um plano para publicar suas atas">Você já pode cadastrar rascunhos. A publicação no marketplace requer um plano ativo. <Link href="/fornecedor/assinatura" className="font-medium underline">Ver planos</Link></Notice>}
      {d.claim === "pendente" && <Notice tone="amber" className="mb-4">A verificação de titularidade da empresa está em análise. Após aprovada, suas atas podem receber o selo “Fornecedor confirmado” e o perfil público é liberado.</Notice>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Atas cadastradas" value={d.c?.total ?? 0} />
        <Stat label="Atas vigentes" value={d.c?.vigentes ?? 0} tone="green" />
        <Stat label="Pendentes de validação" value={d.c?.pendentes ?? 0} tone="amber" />
        <Stat label="Próximas do vencimento" value={d.c?.vencendo ?? 0} hint="nos próximos 60 dias" tone={d.c?.vencendo ? "red" : undefined} />
        <Stat label="Visualizações" value={has(d.ent, "view_stats") ? (d.c?.views ?? 0).toLocaleString("pt-BR") : "—"} hint={has(d.ent, "view_stats") ? `${d.c?.views30 ?? 0} nos últimos 30 dias` : "Disponível no plano Profissional"} />
        <Stat label="Solicitações recebidas" value={d.c?.reqs ?? 0} />
        <Stat label="Contatos realizados" value={d.c?.contatos ?? 0} />
        <Stat label="Plano contratado" value={<span className="text-lg">{d.ent.planName ?? "Nenhum"}</span>} hint={d.ent.periodEnd ? `Próximo vencimento ${dateBR(d.ent.periodEnd)}` : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alertas de vencimento" description={has(d.ent, "expiry_alerts") ? "Atas que vencem nos próximos 90 dias" : "Alertas automáticos disponíveis no plano Profissional"} />
          {d.expiring.length ? <ul className="divide-y divide-slate-100">{d.expiring.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm"><Link className="text-brand-700 hover:underline" href={`/fornecedor/atas/${a.id}`}>Ata {a.ata_number}</Link>
              <span className="flex items-center gap-2"><StatusBadge status={a.status} /><Badge tone="amber">{daysUntil(a.validity_end)} dias</Badge></span></li>))}</ul>
            : <p className="p-5 text-sm text-slate-500">Nenhuma ata próxima do vencimento.</p>}
        </Card>
        <Card>
          <CardHeader title="Atas mais visualizadas" />
          <div className="p-5">{has(d.ent, "view_stats") ? (d.top.length ? <BarList data={d.top} /> : <p className="text-sm text-slate-500">Sem visualizações ainda.</p>) : <p className="text-sm text-slate-500">Estatísticas disponíveis a partir do plano Profissional.</p>}</div>
        </Card>
      </div>
    </>
  );
}

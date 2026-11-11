import { PlanCards, type PlanRow } from "@/components/plans";
import { Badge, Card, CardHeader, Dl, Notice, PageHeader } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { FEATURE_LABELS, getEntitlements } from "@/lib/plans";
import { brl, dateBR } from "@/lib/format";
import { cancelSubscriptionAction, requestPlanAction } from "@/app/conta/billing-actions";

export const metadata = { title: "Licença institucional" };

export default async function License({ searchParams }: { searchParams: Promise<{ solicitado?: string; erro?: string; recurso?: string }> }) {
  const { org } = await requireOrg("government");
  const sp = await searchParams;
  const { ent, plans, subs } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    plans: await tx.many<PlanRow>("SELECT * FROM subscription_plans WHERE audience = 'government' AND active AND price_cents > 0 ORDER BY sort_order"),
    subs: await tx.many<{ id: string; name: string; status: string; price_cents: number; current_period_end: Date | null; contract_reference: string | null; created_at: Date }>(
      "SELECT s.id, p.name, s.status, s.price_cents, s.current_period_end, s.contract_reference, s.created_at FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.organization_id = $1 ORDER BY s.created_at DESC", [org.organization_id]),
  }));
  return (
    <>
      <PageHeader title="Licença institucional" description="Ferramentas avançadas de pesquisa e inteligência para compradores públicos." />
      {sp.solicitado && <Notice tone="green" className="mb-4" title="Solicitação registrada">Nossa equipe entrará em contato com a proposta e a documentação necessária para a instrução do processo de contratação pelo órgão.</Notice>}
      {sp.erro && <Notice tone="red" className="mb-4">{sp.erro === "pendente" ? "Já existe uma solicitação pendente para este plano." : "Plano indisponível."}</Notice>}
      {sp.recurso && <Notice className="mb-4">O recurso solicitado requer licença ativa.</Notice>}
      <Card className="mb-6">
        <CardHeader title="Situação atual" />
        <div className="p-5">
          <Dl items={[["Plano", ent.planName ?? "Sem licença (busca básica gratuita)"], ["Válido até", dateBR(ent.periodEnd)], ["Usuários incluídos", String(ent.userLimit)],
            ["Recursos", Object.entries(ent.features).filter(([, v]) => v === true).map(([k]) => FEATURE_LABELS[k] ?? k).join(", ") || "—"]]} />
        </div>
      </Card>
      <Notice tone="gray" className="mb-6">A contratação de licenças por órgãos públicos deve observar os procedimentos administrativos e legais aplicáveis (instrução processual, dotação orçamentária, formalização contratual e empenho). A plataforma fornece proposta e documentação de suporte.</Notice>
      <PlanCards plans={plans} current={ent.planCode} action={requestPlanAction} cta="Solicitar proposta" highlight="orgao_institucional" />
      {subs.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Histórico" />
          <ul className="divide-y divide-slate-100 text-sm">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span>{s.name} · {brl(s.price_cents / 100)} · solicitado em {dateBR(s.created_at)}{s.contract_reference ? ` · Ref.: ${s.contract_reference}` : ""}</span>
                <span className="flex items-center gap-3"><Badge tone={s.status === "ativa" ? "green" : s.status.startsWith("aguardando") ? "amber" : "gray"}>{s.status.replaceAll("_", " ")}</Badge>
                  {s.status.startsWith("aguardando") && <form action={cancelSubscriptionAction}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-600 hover:underline">Cancelar</button></form>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

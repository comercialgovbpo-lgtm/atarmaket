import { PlanCards, type PlanRow } from "@/components/plans";
import { Badge, Card, CardHeader, Dl, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { FEATURE_LABELS, getEntitlements } from "@/lib/plans";
import { activeProvider } from "@/lib/payments";
import { brl, dateBR } from "@/lib/format";
import { cancelSubscriptionAction, requestPlanAction } from "@/app/conta/billing-actions";

export const metadata = { title: "Assinatura" };

export default async function Subscription({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await requireOrg("supplier");
  const sp = await searchParams;
  const { ent, plans, subs, payments } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    plans: await tx.many<PlanRow>("SELECT * FROM subscription_plans WHERE audience = 'supplier' AND active ORDER BY sort_order"),
    subs: await tx.many<{ id: string; name: string; status: string; price_cents: number; started_at: Date | null; current_period_end: Date | null; provider: string | null; created_at: Date }>(
      "SELECT s.id, p.name, s.status, s.price_cents, s.started_at, s.current_period_end, s.provider, s.created_at FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.organization_id = $1 ORDER BY s.created_at DESC", [org.organization_id]),
    payments: await tx.many<{ id: string; amount_cents: number; status: string; provider: string; paid_at: Date | null; due_date: string | null; created_at: Date; checkout_url: string | null }>(
      "SELECT id, amount_cents, status, provider, paid_at, due_date, created_at, checkout_url FROM payments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 24", [org.organization_id]),
  }));
  const provider = activeProvider();
  const current = subs.find((s) => s.status === "ativa");
  return (
    <>
      <PageHeader title="Assinatura" description="Planos mensais para exposição comercial das suas atas." />
      {sp.bemvindo && <Notice tone="green" className="mb-4" title="Conta criada!">Passo 2 de 3: escolha um plano. Depois cadastre sua primeira ata.</Notice>}
      {sp.solicitado && <Notice tone="blue" className="mb-4" title="Solicitação registrada">{provider ? "Aguardando confirmação do pagamento." : "O pagamento on-line ainda não está habilitado. Nossa equipe enviará as instruções de cobrança e ativará o plano após a confirmação do pagamento."}</Notice>}
      {sp.pagamento === "retorno" && <Notice tone="blue" className="mb-4">Pagamento em processamento. O plano é ativado automaticamente após a confirmação do provedor.</Notice>}
      {sp.recurso && <Notice className="mb-4">Este recurso requer um plano superior.</Notice>}
      {sp.erro && <Notice tone="red" className="mb-4">{sp.erro === "pendente" ? "Já existe uma solicitação pendente para este plano." : "Plano indisponível."}</Notice>}
      <Card className="mb-6"><CardHeader title="Plano atual" />
        <div className="p-5"><Dl items={[["Plano", ent.planName ?? "Nenhum"], ["Status", current ? <Badge tone="green">Ativa</Badge> : <Badge>Sem assinatura ativa</Badge>],
          ["Data de contratação", dateBR(current?.started_at)], ["Próximo vencimento", dateBR(ent.periodEnd)], ["Limite de atas", ent.planCode ? (ent.ataLimit >= 100000 ? "Ilimitado" : String(ent.ataLimit)) : "0"],
          ["Recursos liberados", Object.entries(ent.features).filter(([, v]) => v === true).map(([k]) => FEATURE_LABELS[k] ?? k).join(", ") || "—"]]} /></div>
      </Card>
      <PlanCards plans={plans} current={ent.planCode} action={requestPlanAction} cta={provider ? "Assinar" : "Solicitar contratação"} highlight="profissional" />
      {subs.length > 0 && (
        <Card className="mt-6"><CardHeader title="Assinaturas" />
          <Table><thead><tr><Th>Plano</Th><Th>Status</Th><Th>Valor</Th><Th>Solicitada</Th><Th>Vigente até</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">{subs.map((s) => (
              <tr key={s.id}><Td>{s.name}</Td><Td><Badge tone={s.status === "ativa" ? "green" : s.status.startsWith("aguardando") ? "amber" : "gray"}>{s.status.replaceAll("_", " ")}</Badge></Td><Td>{brl(s.price_cents / 100)}</Td><Td>{dateBR(s.created_at)}</Td><Td>{dateBR(s.current_period_end)}</Td>
                <Td>{["ativa", "aguardando_pagamento"].includes(s.status) && <form action={cancelSubscriptionAction}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-600 hover:underline">Cancelar</button></form>}</Td></tr>))}</tbody></Table>
        </Card>
      )}
      {payments.length > 0 && (
        <Card className="mt-6"><CardHeader title="Pagamentos" />
          <Table><thead><tr><Th>Data</Th><Th>Valor</Th><Th>Status</Th><Th>Provedor</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">{payments.map((p) => (
              <tr key={p.id}><Td>{dateBR(p.paid_at ?? p.created_at)}</Td><Td>{brl(p.amount_cents / 100)}</Td><Td><Badge tone={p.status === "pago" ? "green" : p.status === "pendente" ? "amber" : "red"}>{p.status}</Badge></Td><Td>{p.provider}</Td>
                <Td>{p.status === "pendente" && p.checkout_url && <a href={p.checkout_url} className="text-xs text-brand-700 hover:underline">Concluir pagamento</a>}</Td></tr>))}</tbody></Table>
        </Card>
      )}
    </>
  );
}

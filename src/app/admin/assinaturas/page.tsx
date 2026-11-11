import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { activeProvider } from "@/lib/payments";
import { brl, dateBR, dateTimeBR } from "@/lib/format";
import { activateSubscriptionAction, cancelSubscriptionAdminAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Assinaturas e pagamentos" };

export default async function Subs() {
  const { subs, pays } = await adminRead(async (tx) => ({
    subs: await tx.many<{ id: string; org: string; kind: string; plan: string; status: string; price_cents: number; current_period_end: Date | null; provider: string | null; contract_reference: string | null; notes: string | null; created_at: Date }>(
      `SELECT s.id, o.legal_name org, o.kind, p.name plan, s.status, s.price_cents, s.current_period_end, s.provider, s.contract_reference, s.notes, s.created_at
         FROM subscriptions s JOIN organizations o ON o.id = s.organization_id JOIN subscription_plans p ON p.id = s.plan_id
        ORDER BY (s.status IN ('aguardando_pagamento','aguardando_contratacao')) DESC, s.created_at DESC LIMIT 200`),
    pays: await tx.many<{ id: string; org: string; amount_cents: number; status: string; provider: string; method: string | null; paid_at: Date | null; created_at: Date }>(
      "SELECT p.id, o.legal_name org, p.amount_cents, p.status, p.provider, p.method, p.paid_at, p.created_at FROM payments p JOIN organizations o ON o.id = p.organization_id ORDER BY p.created_at DESC LIMIT 100"),
  }));
  const provider = activeProvider();
  return (
    <>
      <PageHeader title="Assinaturas e pagamentos" description={provider ? `Gateway ativo: ${provider.name}. Renovações são confirmadas via webhook.` : "Nenhum gateway configurado (PAYMENT_PROVIDER). Pagamentos recebidos por PIX, boleto ou empenho podem ser registrados manualmente."} />
      <Card className="mb-6"><CardHeader title="Assinaturas" />
        <Table><thead><tr><Th>Organização</Th><Th>Plano</Th><Th>Status</Th><Th>Valor</Th><Th>Vigente até</Th><Th>Registrar pagamento / ativar</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{subs.map((s) => (
            <tr key={s.id}>
              <Td><p className="font-medium">{s.org}</p><p className="text-xs text-slate-500">{s.kind === "supplier" ? "Fornecedor" : "Órgão"} · {dateBR(s.created_at)}{s.contract_reference ? ` · Ref. ${s.contract_reference}` : ""}</p>{s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}</Td>
              <Td>{s.plan}</Td><Td><Badge tone={s.status === "ativa" ? "green" : s.status.startsWith("aguardando") ? "amber" : "gray"}>{s.status.replaceAll("_", " ")}</Badge></Td>
              <Td className="tabular">{brl(s.price_cents / 100)}</Td><Td>{dateBR(s.current_period_end)}</Td>
              <Td>{s.status !== "cancelada" && (
                <div className="space-y-1">
                  <ActionForm action={activateSubscriptionAction} className="flex flex-wrap gap-1">
                    <input type="hidden" name="id" value={s.id} />
                    <Select name="method" className="h-8 w-28 text-xs" defaultValue={s.kind === "government" ? "empenho" : "pix"}><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="empenho">Empenho/contrato</option><option value="cortesia">Cortesia</option></Select>
                    <Input name="reference" placeholder="Referência" className="h-8 w-28 text-xs" required />
                    <Input name="amount" defaultValue={(s.price_cents / 100).toFixed(2).replace(".", ",")} className="h-8 w-20 text-xs" />
                    <Input name="period_end" type="date" className="h-8 w-36 text-xs" title="Fim do período (opcional)" />
                    <SubmitButton s="sm">Ativar</SubmitButton>
                  </ActionForm>
                  <form action={cancelSubscriptionAdminAction}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-600 hover:underline">Cancelar assinatura</button></form>
                </div>)}</Td>
            </tr>))}</tbody></Table>
      </Card>
      <Card><CardHeader title="Pagamentos" />
        <Table><thead><tr><Th>Data</Th><Th>Organização</Th><Th>Valor</Th><Th>Status</Th><Th>Provedor / meio</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{pays.map((p) => <tr key={p.id}><Td className="text-xs">{dateTimeBR(p.paid_at ?? p.created_at)}</Td><Td>{p.org}</Td><Td className="tabular">{brl(p.amount_cents / 100)}</Td><Td><Badge tone={p.status === "pago" ? "green" : p.status === "pendente" ? "amber" : "red"}>{p.status}</Badge></Td><Td>{p.provider}{p.method ? ` · ${p.method}` : ""}</Td></tr>)}</tbody></Table>
      </Card>
    </>
  );
}

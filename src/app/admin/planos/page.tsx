import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { savePlanAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Planos" };
interface Plan { id: string; code: string; audience: string; name: string; description: string | null; price_cents: number; billing_interval: string; ata_limit: number | null; user_limit: number | null; features: Record<string, unknown>; highlights: string[]; active: boolean; sort_order: number }

function PlanForm({ p }: { p?: Plan }) {
  return (
    <ActionForm action={savePlanAction} className="grid gap-3 p-5 sm:grid-cols-4">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <Field label="Código"><Input name="code" defaultValue={p?.code} required /></Field>
      <Field label="Nome"><Input name="name" defaultValue={p?.name} required /></Field>
      <Field label="Público"><Select name="audience" defaultValue={p?.audience ?? "supplier"}><option value="supplier">Fornecedor</option><option value="government">Órgão</option></Select></Field>
      <Field label="Cobrança"><Select name="billing_interval" defaultValue={p?.billing_interval ?? "month"}><option value="month">Mensal</option><option value="year">Anual</option></Select></Field>
      <Field label="Preço (R$)"><Input name="price" defaultValue={p ? (p.price_cents / 100).toFixed(2).replace(".", ",") : ""} required /></Field>
      <Field label="Limite de atas"><Input name="ata_limit" type="number" defaultValue={p?.ata_limit ?? ""} /></Field>
      <Field label="Limite de usuários"><Input name="user_limit" type="number" defaultValue={p?.user_limit ?? ""} /></Field>
      <Field label="Ordem"><Input name="sort_order" type="number" defaultValue={p?.sort_order ?? 0} /></Field>
      <Field label="Descrição" className="sm:col-span-4"><Input name="description" defaultValue={p?.description ?? ""} /></Field>
      <Field label="Destaques (um por linha)" className="sm:col-span-2"><Textarea name="highlights" rows={4} defaultValue={p?.highlights.join("\n")} /></Field>
      <Field label="Recursos (JSON)" className="sm:col-span-2" hint="Ex.: crm, view_stats, compare, alerts, trial_days"><Textarea name="features" rows={4} defaultValue={JSON.stringify(p?.features ?? {}, null, 1)} className="font-mono text-xs" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} />Ativo</label>
      <div className="sm:col-span-3"><SubmitButton s="sm">Salvar</SubmitButton></div>
    </ActionForm>
  );
}

export default async function Plans() {
  const plans = await adminRead((tx) => tx.many<Plan>("SELECT * FROM subscription_plans ORDER BY audience DESC, sort_order"));
  return (
    <>
      <PageHeader title="Planos" description="Valores, limites e recursos configuráveis. Alterações não afetam o preço de assinaturas já contratadas." />
      <div className="space-y-4">
        {plans.map((p) => <Card key={p.id}><CardHeader title={`${p.name} · ${p.audience === "supplier" ? "Fornecedor" : "Órgão"}`} /><PlanForm p={p} /></Card>)}
        <Card><CardHeader title="Novo plano" /><PlanForm /></Card>
      </div>
    </>
  );
}

import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { createOpportunityAction } from "../../actions";

export const metadata = { title: "Nova oportunidade" };

export default async function NewOpp() {
  const { org } = await requireOrg("supplier");
  const atas = await userDb((tx) => tx.many<{ id: string; ata_number: string }>(
    "SELECT id, ata_number FROM price_registration_atas WHERE submitted_by_org_id = $1 OR supplier_id IN (SELECT app_supplier_ids()) ORDER BY created_at DESC LIMIT 200", [org.organization_id]));
  return (
    <>
      <PageHeader title="Nova oportunidade" description="Registre um órgão interessado contatado fora da plataforma." />
      <Card className="p-6">
        <ActionForm action={createOpportunityAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Título" required className="sm:col-span-2"><Input name="title" required /></Field>
          <Field label="Órgão interessado" required><Input name="government_name" required /></Field>
          <Field label="Ata relacionada"><Select name="ata_id" defaultValue=""><option value="">—</option>{atas.map((a) => <option key={a.id} value={a.id}>Ata {a.ata_number}</option>)}</Select></Field>
          <Field label="Contato"><Input name="contact_name" /></Field>
          <Field label="E-mail"><Input name="contact_email" type="email" /></Field>
          <Field label="Telefone"><Input name="contact_phone" /></Field>
          <Field label="Valor estimado (R$)"><Input name="estimated_value" inputMode="decimal" /></Field>
          <Field label="Data do contato"><Input name="last_contact_at" type="date" /></Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea name="note" rows={3} /></Field>
          <div><SubmitButton>Criar oportunidade</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}

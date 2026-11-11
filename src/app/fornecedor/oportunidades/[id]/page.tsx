import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Dl, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { OPPORTUNITY_STATUS } from "@/lib/atas/status";
import { brl, dateBR, dateTimeBR, toDateInput } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";
import { updateOpportunityAction } from "../../actions";

export const metadata = { title: "Oportunidade" };

export default async function Opp({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  await requireOrg("supplier");
  const d = await userDb(async (tx) => {
    const o = await tx.one<{ id: string; title: string; government_name: string; status: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; estimated_value: string | null; last_contact_at: string | null; next_action_at: string | null; ata_id: string | null; created_at: Date; contact_request_id: string | null }>(
      "SELECT * FROM commercial_opportunities WHERE id = $1", [id]);
    if (!o) return null;
    const ev = await tx.many<{ kind: string; from_status: string | null; to_status: string | null; note: string | null; occurred_at: string | null; created_at: Date; author: string | null }>(
      "SELECT e.kind, e.from_status, e.to_status, e.note, e.occurred_at, e.created_at, u.full_name AS author FROM opportunity_events e LEFT JOIN users u ON u.id = e.author_id WHERE e.opportunity_id = $1 ORDER BY e.created_at DESC", [id]);
    return { o, ev };
  });
  if (!d) notFound();
  const { o, ev } = d;
  return (
    <>
      <PageHeader breadcrumb={<Link href="/fornecedor/oportunidades" className="hover:underline">Oportunidades</Link>} title={o.government_name} description={o.title} actions={<Badge tone="blue">{OPPORTUNITY_STATUS[o.status]}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card><CardHeader title="Atualizar" />
            <ActionForm action={updateOpportunityAction} className="grid gap-4 p-5 sm:grid-cols-2">
              <input type="hidden" name="id" value={o.id} />
              <Field label="Etapa"><Select name="status" defaultValue={o.status}>{Object.entries(OPPORTUNITY_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="Data do contato"><Input name="contact_date" type="date" /></Field>
              <Field label="Próxima ação"><Input name="next_action_at" type="date" defaultValue={toDateInput(o.next_action_at)} /></Field>
              <Field label="Valor estimado (R$)"><Input name="estimated_value" inputMode="decimal" placeholder={o.estimated_value ?? ""} /></Field>
              <Field label="Observação" className="sm:col-span-2"><Textarea name="note" rows={3} /></Field>
              <div><SubmitButton>Salvar</SubmitButton></div>
            </ActionForm>
          </Card>
          <Card><CardHeader title="Histórico" />
            <ol className="divide-y divide-slate-100 text-sm">{ev.map((e, i) => (
              <li key={i} className="px-5 py-3"><p className="text-xs text-slate-500">{dateTimeBR(e.created_at)}{e.author ? ` · ${e.author}` : ""}{e.occurred_at ? ` · contato em ${dateBR(e.occurred_at)}` : ""}</p>
                {e.kind === "mudanca_status" && <p className="font-medium">{e.from_status ? `${OPPORTUNITY_STATUS[e.from_status]} → ` : ""}{OPPORTUNITY_STATUS[e.to_status ?? ""]}</p>}
                {e.note && <p className="whitespace-pre-line text-slate-700">{e.note}</p>}</li>))}</ol>
          </Card>
        </div>
        <Card className="h-fit"><CardHeader title="Dados" />
          <div className="p-5"><Dl cols={1} items={[["Contato", o.contact_name], ["E-mail", o.contact_email], ["Telefone", o.contact_phone], ["Valor estimado", brl(o.estimated_value)], ["Último contato", dateBR(o.last_contact_at)], ["Criada em", dateBR(o.created_at)],
            ["Ata", o.ata_id ? <Link href={`/atas/${o.ata_id}`} className="text-brand-700 hover:underline">Ver ata</Link> : "—"], ["Origem", o.contact_request_id ? "Solicitação pela plataforma" : "Registro manual"]]} /></div>
        </Card>
      </div>
    </>
  );
}

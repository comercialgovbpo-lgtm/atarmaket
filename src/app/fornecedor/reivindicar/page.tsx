import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { dateBR } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";
import { claimAction } from "../actions";

export const metadata = { title: "Reivindicar atas" };

export default async function Claim({ searchParams }: { searchParams: Promise<{ ata?: string }> }) {
  const { org } = await requireOrg("supplier");
  const sp = await searchParams;
  const ataId = uuidSchema.safeParse(sp.ata).success ? sp.ata! : null;
  const d = await userDb(async (tx) => ({
    ata: ataId ? await tx.one<{ ata_number: string; object: string }>("SELECT ata_number, object FROM price_registration_atas WHERE id = $1", [ataId]) : null,
    claims: await tx.many<{ id: string; status: string; relationship: string; created_at: Date; review_notes: string | null; ata_number: string | null; supplier: string }>(
      `SELECT c.id, c.status, c.relationship, c.created_at, c.review_notes, a.ata_number, s.legal_name AS supplier FROM supplier_claims c
         JOIN suppliers s ON s.id = c.supplier_id LEFT JOIN price_registration_atas a ON a.id = c.ata_id WHERE c.claimant_org_id = $1 ORDER BY c.created_at DESC`, [org.organization_id]),
  }));
  return (
    <>
      <PageHeader title="Reivindicar titularidade ou representação" description="Vincule à sua empresa atas já encontradas na base pública. Toda reivindicação exige evidência e passa por revisão administrativa." />
      <Card className="mb-6 p-6">
        {d.ata && <Notice className="mb-4">Ata selecionada: nº {d.ata.ata_number} — {d.ata.object.slice(0, 160)}</Notice>}
        <ActionForm action={claimAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="ata_id" value={ataId ?? ""} />
          <Field label="Vínculo"><Select name="relationship" defaultValue="titular"><option value="titular">Empresa titular (detentora da ata)</option><option value="representante_comercial">Representante comercial autorizado</option></Select></Field>
          <Field label="Evidência (PDF/imagem)" hint="Contrato social, procuração, contrato de representação ou ata assinada."><input type="file" name="file" required accept="application/pdf,image/png,image/jpeg" className="block w-full text-sm" /></Field>
          <Field label="Justificativa" className="sm:col-span-2"><Textarea name="justification" required rows={4} placeholder="Explique o vínculo da empresa com a ata/fornecedor e o que a evidência comprova." /></Field>
          <div><SubmitButton>Enviar para análise</SubmitButton></div>
        </ActionForm>
      </Card>
      <Card><CardHeader title="Minhas reivindicações" />
        <ul className="divide-y divide-slate-100 text-sm">{d.claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span>{c.ata_number ? `Ata ${c.ata_number}` : "Perfil da empresa"} · {c.supplier} · {c.relationship === "titular" ? "Titular" : "Representante"} · {dateBR(c.created_at)}{c.review_notes ? <span className="block text-xs text-slate-500">{c.review_notes}</span> : null}</span>
            <Badge tone={c.status === "aprovada" ? "green" : c.status === "rejeitada" ? "red" : "amber"}>{c.status}</Badge>
          </li>))}{d.claims.length === 0 && <li className="px-5 py-3 text-slate-500">Nenhuma reivindicação.</li>}</ul>
      </Card>
    </>
  );
}

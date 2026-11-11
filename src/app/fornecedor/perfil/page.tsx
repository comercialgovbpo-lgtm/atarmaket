import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Dl, Field, Input, Notice, PageHeader, Textarea } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/format";
import { updateSupplierProfileAction } from "../actions";

export const metadata = { title: "Perfil empresarial" };

export default async function Profile() {
  const { org } = await requireOrg("supplier");
  const d = await userDb(async (tx) => ({
    o: await tx.one<{ legal_name: string; trade_name: string | null; cnpj: string; cnae: string | null; email: string; phone: string; address: string | null; city: string; state: string; commercial_contact: string | null; verification_status: string }>("SELECT * FROM organizations WHERE id = $1", [org.organization_id]),
    s: await tx.one<{ id: string; trade_name: string | null; profile_description: string | null; website: string | null; public_email: string | null; public_phone: string | null; show_contact: boolean }>("SELECT * FROM suppliers WHERE id IN (SELECT app_supplier_ids()) LIMIT 1"),
  }));
  return (
    <>
      <PageHeader title="Perfil empresarial" actions={d.s && <Link href={`/fornecedores/${d.s.id}`} className="text-sm text-brand-700 hover:underline">Ver perfil público</Link>} />
      <Card className="mb-6 p-5">
        <Dl cols={3} items={[["Razão social", d.o?.legal_name], ["CNPJ", formatCnpj(d.o?.cnpj)], ["CNAE", d.o?.cnae], ["E-mail", d.o?.email], ["Telefone", d.o?.phone], ["Responsável comercial", d.o?.commercial_contact],
          ["Endereço", d.o?.address], ["Município/UF", `${d.o?.city}/${d.o?.state}`], ["Verificação", d.o?.verification_status === "verified" ? "Verificada" : d.o?.verification_status === "rejected" ? "Não aprovada" : "Pendente"]]} />
        <p className="mt-3 text-xs text-slate-500">Dados cadastrais privados. Para alterar CNPJ ou razão social, contate o suporte.</p>
      </Card>
      {!d.s ? <Notice tone="amber" title="Perfil público disponível após a verificação">A equipe está verificando a titularidade/representação da empresa. Após aprovada, você poderá editar o perfil exibido no marketplace.</Notice> : (
        <Card className="p-6">
          <h2 className="font-semibold text-navy-900">Perfil público no marketplace</h2>
          <ActionForm action={updateSupplierProfileAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nome fantasia"><Input name="trade_name" defaultValue={d.s.trade_name ?? ""} /></Field>
            <Field label="Site"><Input name="website" type="url" defaultValue={d.s.website ?? ""} placeholder="https://" /></Field>
            <Field label="Apresentação comercial" className="sm:col-span-2"><Textarea name="profile_description" defaultValue={d.s.profile_description ?? ""} rows={5} /></Field>
            <Field label="E-mail público"><Input name="public_email" type="email" defaultValue={d.s.public_email ?? ""} /></Field>
            <Field label="Telefone público"><Input name="public_phone" defaultValue={d.s.public_phone ?? ""} /></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="show_contact" defaultChecked={d.s.show_contact} className="mt-1" />Autorizo a exibição pública do e-mail e telefone acima nas páginas das atas e do perfil.</label>
            <div><SubmitButton>Salvar perfil</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}

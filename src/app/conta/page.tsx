import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireUser, userDb } from "@/lib/auth/session";
import { switchOrgAction } from "@/app/(auth)/actions";
import { changePasswordAction, dataRequestAction, deleteAccountAction, updateProfileAction } from "./actions";

export const metadata = { title: "Minha conta" };

export default async function Account() {
  const user = await requireUser("/conta");
  const me = await userDb((tx) => tx.one<{ phone: string | null; marketing_consent: boolean; terms_accepted_at: Date | null }>("SELECT phone, marketing_consent, terms_accepted_at FROM users WHERE id = $1", [user.id]));
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Minha conta" description={user.email} actions={user.activeOrg && <Link href="/conta/equipe" className="text-sm text-brand-700 hover:underline">Equipe da organização</Link>} />
      <div className="space-y-6">
        {user.memberships.length > 1 && (
          <Card><CardHeader title="Organização ativa" />
            <form action={switchOrgAction} className="flex gap-2 p-5">
              <Select name="org" defaultValue={user.activeOrg?.organization_id}>{user.memberships.map((m) => <option key={m.organization_id} value={m.organization_id}>{m.legal_name} ({m.kind === "supplier" ? "fornecedor" : "órgão"})</option>)}</Select>
              <button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Alternar</button>
            </form>
          </Card>
        )}
        <Card><CardHeader title="Dados pessoais" />
          <ActionForm action={updateProfileAction} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nome"><Input name="full_name" defaultValue={user.full_name} required /></Field>
            <Field label="Telefone"><Input name="phone" defaultValue={me?.phone ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="marketing" defaultChecked={me?.marketing_consent} />Aceito receber comunicações comerciais (opcional)</label>
            <div><SubmitButton>Salvar</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card><CardHeader title="Alterar senha" />
          <ActionForm action={changePasswordAction} className="grid gap-4 p-5 sm:grid-cols-2" resetOnSuccess>
            <Field label="Senha atual"><Input name="current" type="password" required autoComplete="current-password" /></Field>
            <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letras e números."><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
            <div><SubmitButton>Alterar senha</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card><CardHeader title="Privacidade e dados pessoais (LGPD)" description={`Termos aceitos em ${me?.terms_accepted_at ? new Date(me.terms_accepted_at).toLocaleDateString("pt-BR") : "—"}.`} />
          <div className="space-y-5 p-5">
            <a href="/api/conta/exportar" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium">Baixar meus dados (JSON)</a>
            <ActionForm action={dataRequestAction} className="grid gap-3 sm:grid-cols-3">
              <Field label="Solicitação"><Select name="kind"><option value="acesso">Acesso</option><option value="correcao">Correção</option><option value="portabilidade">Portabilidade</option><option value="revogacao_consentimento">Revogação de consentimento</option><option value="exclusao">Exclusão</option></Select></Field>
              <Field label="Detalhes" className="sm:col-span-2"><Textarea name="details" rows={2} /></Field>
              <div><SubmitButton variant="secondary">Enviar solicitação</SubmitButton></div>
            </ActionForm>
            <details className="rounded-lg border border-red-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Excluir minha conta</summary>
              <ActionForm action={deleteAccountAction} className="mt-3 flex flex-wrap items-end gap-3">
                <p className="w-full text-sm text-slate-600">Seus dados pessoais serão anonimizados. Registros necessários ao cumprimento de obrigações legais e à auditoria são mantidos de forma dissociada.</p>
                <Field label="Digite EXCLUIR para confirmar"><Input name="confirm" /></Field>
                <SubmitButton variant="danger">Excluir conta</SubmitButton>
              </ActionForm>
            </details>
          </div>
        </Card>
      </div>
    </div>
  );
}

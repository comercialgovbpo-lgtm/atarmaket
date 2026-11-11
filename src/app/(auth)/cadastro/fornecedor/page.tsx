import { CnpjInput } from "@/components/cnpj-input";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Notice, Select } from "@/components/ui";
import { UFS } from "@/lib/validators";
import { signupSupplierAction } from "../../actions";
import { ConsentFields } from "../../consent";

export const metadata = { title: "Cadastrar empresa fornecedora" };

export default function SupplierSignup() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm font-medium text-brand-700">Passo 1 de 3 · Dados da empresa</p>
      <h1 className="mt-1 text-2xl font-semibold text-navy-900">Cadastrar minha empresa</h1>
      <p className="mt-1 text-sm text-slate-600">Depois do cadastro você escolhe um plano e cadastra sua primeira ata.</p>
      <Notice className="mt-4" tone="gray">
        A titularidade ou a representação da empresa será verificada pela equipe da plataforma. Até a verificação, suas atas ficam em validação
        e não aparecem como “fornecedor confirmado”.
      </Notice>
      <Card className="mt-6 p-6">
        <ActionForm action={signupSupplierAction} className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-slate-900">Empresa</legend>
            <Field label="CNPJ" required><CnpjInput kind="supplier" fillTarget="legal_name" /></Field>
            <Field label="CNAE principal"><Input name="cnae" placeholder="0000-0/00" /></Field>
            <Field label="Razão social" required className="sm:col-span-2"><Input name="legal_name" required /></Field>
            <Field label="Nome fantasia" className="sm:col-span-2"><Input name="trade_name" /></Field>
            <Field label="E-mail comercial" required hint="Também será seu login."><Input name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Telefone" required><Input name="phone" type="tel" required autoComplete="tel" /></Field>
            <Field label="Endereço" className="sm:col-span-2"><Input name="address" autoComplete="street-address" /></Field>
            <Field label="Município" required><Input name="city" required /></Field>
            <Field label="UF" required>
              <Select name="state" required defaultValue=""><option value="" disabled>Selecione</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>
            </Field>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-slate-900">Acesso</legend>
            <Field label="Seu nome" required><Input name="full_name" required autoComplete="name" /></Field>
            <Field label="Responsável comercial" required><Input name="commercial_contact" required /></Field>
            <Field label="Senha" required hint="Mínimo de 10 caracteres, com letras e números." className="sm:col-span-2"><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
          </fieldset>
          <ConsentFields marketing />
          <SubmitButton s="lg" className="w-full sm:w-auto">Criar conta da empresa</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

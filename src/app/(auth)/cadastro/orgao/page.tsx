import { CnpjInput } from "@/components/cnpj-input";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Notice, Select } from "@/components/ui";
import { UFS } from "@/lib/validators";
import { signupGovAction } from "../../actions";
import { ConsentFields } from "../../consent";

export const metadata = { title: "Cadastro institucional de órgão público" };

const POWERS: [string, string][] = [
  ["executivo", "Executivo"], ["legislativo", "Legislativo"], ["judiciario", "Judiciário"], ["ministerio_publico", "Ministério Público"],
  ["tribunal_contas", "Tribunal de Contas"], ["defensoria", "Defensoria Pública"], ["autarquia_fundacao", "Autarquia / Fundação"],
  ["empresa_estatal", "Empresa estatal"], ["consorcio", "Consórcio público"], ["outro", "Outro"],
];

export default function GovSignup() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Cadastro institucional</h1>
      <p className="mt-1 text-sm text-slate-600">Para órgãos e entidades da Administração Pública. A busca básica continua pública e gratuita.</p>
      <Notice className="mt-4" tone="gray">
        O vínculo institucional será validado pela equipe da plataforma. Use, sempre que possível, e-mail com domínio institucional (ex.: gov.br).
        A contratação de licenças observa os procedimentos administrativos e legais aplicáveis ao órgão.
      </Notice>
      <Card className="mt-6 p-6">
        <ActionForm action={signupGovAction} className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-slate-900">Instituição</legend>
            <Field label="CNPJ do órgão" required><CnpjInput kind="government" fillTarget="legal_name" /></Field>
            <Field label="Esfera administrativa" required>
              <Select name="sphere" required defaultValue=""><option value="" disabled>Selecione</option><option value="federal">Federal</option><option value="estadual">Estadual</option><option value="distrital">Distrital</option><option value="municipal">Municipal</option></Select>
            </Field>
            <Field label="Nome da instituição" required className="sm:col-span-2"><Input name="legal_name" required /></Field>
            <Field label="Poder" required>
              <Select name="power" required defaultValue=""><option value="" disabled>Selecione</option>{POWERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </Field>
            <Field label="UF" required>
              <Select name="state" required defaultValue=""><option value="" disabled>Selecione</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>
            </Field>
            <Field label="Município" required><Input name="city" required /></Field>
            <Field label="Endereço"><Input name="address" /></Field>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-slate-900">Responsável</legend>
            <Field label="Nome do responsável" required><Input name="full_name" required autoComplete="name" /></Field>
            <Field label="Cargo" required><Input name="responsible_title" required /></Field>
            <Field label="E-mail institucional" required><Input name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Telefone" required><Input name="phone" type="tel" required /></Field>
            <Field label="Senha" required hint="Mínimo de 10 caracteres, com letras e números." className="sm:col-span-2"><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
          </fieldset>
          <ConsentFields />
          <SubmitButton s="lg">Criar acesso institucional</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { dataRequestAction } from "@/app/conta/actions";
import { LegalPage } from "../legal";

export const metadata = { title: "Direitos do titular (LGPD)" };

export default function LgpdPage() {
  return (
    <LegalPage title="Direitos do titular de dados" updated="11/2026">
      <p>Use o formulário para exercer os direitos previstos no art. 18 da Lei 13.709/2018. Poderemos solicitar confirmação de identidade.</p>
      <Card className="p-6">
        <ActionForm action={dataRequestAction} className="space-y-4">
          <Field label="E-mail" required><Input name="email" type="email" required /></Field>
          <Field label="Solicitação"><Select name="kind"><option value="acesso">Confirmação e acesso aos dados</option><option value="correcao">Correção</option><option value="exclusao">Anonimização ou eliminação</option><option value="portabilidade">Portabilidade</option><option value="revogacao_consentimento">Revogação de consentimento</option></Select></Field>
          <Field label="Detalhes"><Textarea name="details" rows={4} /></Field>
          <SubmitButton>Enviar</SubmitButton>
        </ActionForm>
      </Card>
    </LegalPage>
  );
}

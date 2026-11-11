import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";
import { requestResetAction } from "../actions";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-navy-900">Recuperar senha</h1>
      <p className="mt-1 text-sm text-slate-600">Enviaremos um link de redefinição válido por 1 hora.</p>
      <Card className="mt-6 p-6">
        <ActionForm action={requestResetAction} className="space-y-4">
          <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" /></Field>
          <SubmitButton className="w-full">Enviar link</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

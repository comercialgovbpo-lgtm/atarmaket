import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";
import { resetPasswordAction } from "../../actions";

export const metadata = { title: "Redefinir senha" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-navy-900">Definir nova senha</h1>
      <Card className="mt-6 p-6">
        <ActionForm action={resetPasswordAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letras e números."><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
          <Field label="Confirmar senha"><Input name="confirm" type="password" required autoComplete="new-password" /></Field>
          <SubmitButton className="w-full">Salvar nova senha</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

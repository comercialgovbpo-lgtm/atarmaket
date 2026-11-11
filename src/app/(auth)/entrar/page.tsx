import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Notice } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; redefinida?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-navy-900">Entrar</h1>
      <p className="mt-1 text-sm text-slate-600">Acesse o painel da sua empresa ou do seu órgão.</p>
      {sp.redefinida && <Notice tone="green" className="mt-4">Senha redefinida. Entre com a nova senha.</Notice>}
      <Card className="mt-6 p-6">
        <ActionForm action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <Field label="E-mail"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Senha"><Input name="password" type="password" autoComplete="current-password" required /></Field>
          <SubmitButton className="w-full">Entrar</SubmitButton>
        </ActionForm>
        <div className="mt-4 flex justify-between text-sm">
          <Link href="/recuperar-senha" className="text-brand-700 hover:underline">Esqueci minha senha</Link>
          <Link href="/cadastro" className="text-brand-700 hover:underline">Criar conta</Link>
        </div>
      </Card>
    </div>
  );
}

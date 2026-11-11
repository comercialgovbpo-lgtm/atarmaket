import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { canManageOrg, requireUser, userDb } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { getEntitlements } from "@/lib/plans";
import { addMemberAction, removeMemberAction } from "../actions";

export const metadata = { title: "Equipe" };
const ROLE: Record<string, string> = { owner: "Titular", admin: "Administrador", member: "Membro", viewer: "Leitura" };

export default async function Team() {
  const user = await requireUser("/conta/equipe");
  if (!user.activeOrg) redirect("/conta");
  const org = user.activeOrg;
  const manage = canManageOrg(org);
  // E-mails de membros só para titulares/administradores da organização (consulta pelo servidor após checar o papel).
  const run = manage ? systemDb : userDb;
  const { members, ent } = await run(async (tx) => ({
    members: await tx.many<{ user_id: string; role: string; job_title: string | null; full_name: string | null; email: string | null }>(
      `SELECT m.user_id, m.role, m.job_title, u.full_name, u.email FROM organization_members m
         LEFT JOIN users u ON u.id = m.user_id WHERE m.organization_id = $1 ORDER BY m.created_at`, [org.organization_id]),
    ent: await getEntitlements(tx, org.organization_id),
  }));
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Equipe" description={`${org.legal_name} · ${members.length} de ${ent.userLimit} usuário(s) do plano`} />
      <Card className="mb-6">
        <Table><thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Cargo</Th><Th>Papel</Th><Th></Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{members.map((m) => (
            <tr key={m.user_id}><Td>{m.full_name ?? "—"}</Td><Td>{m.email ?? <span className="text-slate-400">visível apenas a administradores</span>}</Td><Td>{m.job_title ?? "—"}</Td><Td><Badge>{ROLE[m.role]}</Badge></Td>
              <Td className="text-right">{manage && m.role !== "owner" && m.user_id !== user.id && <form action={removeMemberAction}><input type="hidden" name="user_id" value={m.user_id} /><button className="text-xs text-red-600 hover:underline">Remover</button></form>}</Td></tr>
          ))}</tbody></Table>
      </Card>
      {manage && (
        <Card><CardHeader title="Adicionar usuário" description="Se a pessoa ainda não tiver conta, receberá um convite por e-mail para definir a senha." />
          <ActionForm action={addMemberAction} className="grid gap-4 p-5 sm:grid-cols-2" resetOnSuccess>
            <Field label="Nome"><Input name="full_name" required /></Field>
            <Field label="E-mail"><Input name="email" type="email" required /></Field>
            <Field label="Cargo"><Input name="job_title" /></Field>
            <Field label="Papel"><Select name="role" defaultValue="member"><option value="admin">Administrador</option><option value="member">Membro</option><option value="viewer">Somente leitura</option></Select></Field>
            <div><SubmitButton>Adicionar</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

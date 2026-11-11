"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canManageOrg, destroySession, getCurrentUser, requireUser, revokeAllSessions, sha256, userDb } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { queueEmail } from "@/lib/notify";
import { getEntitlements } from "@/lib/plans";
import { emailSchema, formDataToObject, optText, passwordSchema, text, uuidSchema } from "@/lib/validators";

export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.activeOrg || !canManageOrg(user.activeOrg)) return { error: "Sem permissão." };
  const org = user.activeOrg;
  const p = z.object({ email: emailSchema, full_name: text(120).pipe(z.string().min(3, "Informe o nome")), role: z.enum(["admin", "member", "viewer"]), job_title: optText(120) }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const ent = await userDb((tx) => getEntitlements(tx, org.organization_id));
  const r = await systemDb(async (tx) => {
    const count = await tx.one<{ n: number }>("SELECT count(*)::int n FROM organization_members WHERE organization_id = $1", [org.organization_id]);
    if ((count?.n ?? 0) >= Math.max(1, ent.userLimit)) return { error: `O plano atual permite até ${ent.userLimit} usuário(s).` };
    let u = await tx.one<{ id: string }>("SELECT id FROM users WHERE email = $1", [p.data.email]);
    let invited = false;
    if (!u) {
      u = await tx.one<{ id: string }>("INSERT INTO users(email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id",
        [p.data.email, await hashPassword(randomBytes(24).toString("hex")), p.data.full_name]);
      invited = true;
    }
    if (await tx.one("SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2", [org.organization_id, u!.id])) return { error: "Usuário já é membro." };
    await tx.exec("INSERT INTO organization_members(organization_id, user_id, role, job_title) VALUES ($1,$2,$3,$4)", [org.organization_id, u!.id, p.data.role, p.data.job_title ?? null]);
    if (invited) {
      const token = randomBytes(32).toString("base64url");
      await tx.exec("INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '72 hours')", [sha256(token), u!.id]);
      await queueEmail(tx, p.data.email, `Convite para ${org.legal_name}`, `Você foi convidado(a) a acessar a conta de ${org.legal_name}. Defina sua senha em: ${env.appUrl}/redefinir-senha/${token} (válido por 72 horas). Ao definir a senha você aceita os Termos de Uso e a Política de Privacidade.`);
      if (!env.isProd) console.info(`[dev] convite: ${env.appUrl}/redefinir-senha/${token}`);
    }
    await audit(tx, { id: user.id, role: "user" }, "membro_adicionado", "organization", org.organization_id, { member: u!.id, role: p.data.role });
    return { ok: true, message: invited ? "Convite enviado por e-mail." : "Usuário adicionado." };
  });
  revalidatePath("/conta/equipe");
  return r;
}

export async function removeMemberAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user?.activeOrg || !canManageOrg(user.activeOrg)) return;
  const uid = uuidSchema.safeParse(fd.get("user_id"));
  if (!uid.success || uid.data === user.id) return;
  await userDb(async (tx) => {
    await tx.exec("DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role <> 'owner'", [user.activeOrg!.organization_id, uid.data]);
    await audit(tx, { id: user.id, role: "user" }, "membro_removido", "organization", user.activeOrg!.organization_id, { member: uid.data });
  });
  revalidatePath("/conta/equipe");
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const p = z.object({ full_name: text(120).pipe(z.string().min(3)), phone: optText(30), marketing: z.string().optional() }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: "Dados inválidos." };
  await userDb(async (tx) => {
    await tx.exec("UPDATE users SET full_name = $2, phone = $3, marketing_consent = $4 WHERE id = $1", [user.id, p.data.full_name, p.data.phone ?? null, p.data.marketing === "on"]);
    await audit(tx, { id: user.id, role: "user" }, "perfil_atualizado", "user", user.id);
  });
  return { ok: true, message: "Dados atualizados." };
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const p = z.object({ current: z.string().min(1), password: passwordSchema }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const ok = await systemDb(async (tx) => {
    const u = await tx.one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
    if (!u || !(await verifyPassword(p.data.current, u.password_hash))) return false;
    await tx.exec("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, await hashPassword(p.data.password)]);
    await tx.exec("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [user.id, user.sessionId]);
    await audit(tx, { id: user.id, role: "user" }, "senha_alterada", "user", user.id);
    return true;
  });
  return ok ? { ok: true, message: "Senha alterada. Outras sessões foram encerradas." } : { error: "Senha atual incorreta." };
}

/** LGPD: solicitação de direitos do titular (também acessível sem login em /lgpd). */
export async function dataRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const p = z.object({ kind: z.enum(["acesso", "correcao", "exclusao", "portabilidade", "revogacao_consentimento"]), details: optText(3000), email: emailSchema.optional() }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: "Dados inválidos." };
  const email = user?.email ?? p.data.email;
  if (!email) return { error: "Informe o e-mail." };
  await systemDb(async (tx) => {
    const r = await tx.one<{ id: string }>("INSERT INTO data_subject_requests(user_id, email, kind, details) VALUES ($1,$2,$3,$4) RETURNING id", [user?.id ?? null, email, p.data.kind, p.data.details ?? null]);
    await audit(tx, user ? { id: user.id, role: "user" } : null, "lgpd_solicitacao", "data_subject_request", r!.id, { kind: p.data.kind });
  });
  return { ok: true, message: "Solicitação registrada. Responderemos no prazo legal pelo e-mail informado." };
}

/** Exclusão da conta: anonimiza dados pessoais e mantém registros necessários (auditoria / obrigações legais). */
export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (fd.get("confirm") !== "EXCLUIR") return { error: "Digite EXCLUIR para confirmar." };
  const owner = user.memberships.find((m) => m.role === "owner");
  if (owner) {
    const others = await systemDb((tx) => tx.one<{ n: number }>("SELECT count(*)::int n FROM organization_members WHERE organization_id = $1 AND user_id <> $2", [owner.organization_id, user.id]));
    if ((others?.n ?? 0) > 0) return { error: "Transfira a titularidade da organização a outro membro antes de excluir sua conta." };
  }
  await systemDb(async (tx) => {
    await tx.exec(`UPDATE users SET email = $2, full_name = 'Usuário removido', phone = NULL, password_hash = $3, status = 'deleted',
                   marketing_consent = false, deleted_at = now() WHERE id = $1`, [user.id, `removido+${user.id}@anonimizado.invalid`, randomBytes(16).toString("hex")]);
    await tx.exec("DELETE FROM organization_members WHERE user_id = $1", [user.id]);
    await tx.exec("DELETE FROM saved_searches WHERE user_id = $1", [user.id]);
    await tx.exec("DELETE FROM favorites WHERE user_id = $1", [user.id]);
    await tx.exec("DELETE FROM notifications WHERE user_id = $1", [user.id]);
    await tx.exec("UPDATE search_logs SET user_id = NULL WHERE user_id = $1", [user.id]);
    await revokeAllSessions(user.id, tx);
    await audit(tx, { id: user.id, role: "user" }, "conta_excluida", "user", user.id);
  });
  await destroySession();
  redirect("/?conta=excluida");
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await userDb((tx) => tx.exec("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id]));
  revalidatePath("/notificacoes");
}

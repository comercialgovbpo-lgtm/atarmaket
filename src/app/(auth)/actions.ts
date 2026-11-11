"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { dummyVerify, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser, revokeAllSessions, sha256 } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { queueEmail } from "@/lib/notify";
import { limitByIp, rateLimit } from "@/lib/rate-limit";
import { cnpjSchema, emailSchema, formDataToObject, optText, passwordSchema, text, ufSchema } from "@/lib/validators";

const fieldErrors = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
const safeNext = (n: string | undefined) => (n && n.startsWith("/") && !n.startsWith("//") ? n : null);

// ------------------------------------------------------------------ Login
export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await limitByIp("login", 20, 15 * 60_000);
  if (!ip.ok) return { error: `Muitas tentativas. Tente novamente em ${Math.ceil(ip.retryAfter / 60)} min.` };
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128), next: z.string().optional() }).safeParse(formDataToObject(fd));
  if (!parsed.success) return { error: "Informe e-mail e senha." };
  const { email, password } = parsed.data;
  if (!rateLimit(`login-email:${email}`, 10, 15 * 60_000).ok) return { error: "Muitas tentativas para este e-mail. Aguarde alguns minutos." };

  const user = await systemDb((tx) => tx.one<{ id: string; password_hash: string; status: string; locked_until: Date | null; platform_role: string }>(
    "SELECT id, password_hash, status, locked_until, platform_role FROM users WHERE email = $1", [email]));
  const okPw = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
  if (!user || user.status !== "active" || !okPw || (user.locked_until && user.locked_until > new Date())) {
    if (user) await systemDb(async (tx) => {
      await tx.exec(`UPDATE users SET failed_logins = failed_logins + 1,
        locked_until = CASE WHEN failed_logins + 1 >= 8 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = $1`, [user.id]);
      await audit(tx, { id: user.id, role: "user" }, "login_falhou", "user", user.id);
    });
    return { error: user?.locked_until && user.locked_until > new Date() ? "Conta temporariamente bloqueada por tentativas inválidas." : "E-mail ou senha inválidos." };
  }
  await systemDb(async (tx) => {
    await tx.exec("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [user.id]);
    await audit(tx, { id: user.id, role: user.platform_role }, "login", "user", user.id);
  });
  await createSession(user.id, (await headers()).get("user-agent"));
  redirect(safeNext(parsed.data.next) ?? (user.platform_role === "admin" ? "/admin" : "/painel"));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

// ------------------------------------------------------------------ Cadastro
const consent = z.literal("on", { message: "É necessário aceitar os Termos de Uso e a Política de Privacidade" });

const supplierSchema = z.object({
  cnpj: cnpjSchema,
  legal_name: text(200).pipe(z.string().min(3, "Informe a razão social")),
  trade_name: optText(200),
  cnae: optText(20),
  email: emailSchema,
  phone: text(30).pipe(z.string().min(8, "Informe o telefone")),
  address: optText(300),
  city: text(80).pipe(z.string().min(2, "Informe o município")),
  state: ufSchema,
  commercial_contact: text(120).pipe(z.string().min(3, "Informe o responsável comercial")),
  full_name: text(120).pipe(z.string().min(3, "Informe seu nome")),
  password: passwordSchema,
  accept_terms: consent,
  marketing: z.string().optional(),
});

export async function signupSupplierAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const rl = await limitByIp("signup", 8, 60 * 60_000);
  if (!rl.ok) return { error: "Limite de cadastros atingido. Tente mais tarde." };
  const p = supplierSchema.safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fieldErrors(p.error) };
  const d = p.data;
  const hash = await hashPassword(d.password);
  const res = await systemDb(async (tx) => {
    if (await tx.one("SELECT 1 FROM users WHERE email = $1", [d.email])) return { error: "Já existe uma conta com este e-mail." };
    if (await tx.one("SELECT 1 FROM organizations WHERE kind = 'supplier' AND cnpj = $1", [d.cnpj]))
      return { error: "Esta empresa já possui conta. Solicite acesso ao responsável pela conta da empresa." };
    const u = await tx.one<{ id: string }>(
      `INSERT INTO users(email, password_hash, full_name, phone, terms_accepted_at, privacy_accepted_at, marketing_consent)
       VALUES ($1,$2,$3,$4,now(),now(),$5) RETURNING id`, [d.email, hash, d.full_name, d.phone, d.marketing === "on"]);
    const o = await tx.one<{ id: string }>(
      `INSERT INTO organizations(kind, cnpj, legal_name, trade_name, cnae, email, phone, address, city, state, commercial_contact)
       VALUES ('supplier',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [d.cnpj, d.legal_name, d.trade_name ?? null, d.cnae ?? null, d.email, d.phone, d.address ?? null, d.city, d.state, d.commercial_contact]);
    await tx.exec("INSERT INTO organization_members(organization_id, user_id, role, job_title) VALUES ($1,$2,'owner','Responsável')", [o!.id, u!.id]);
    // Registro público do fornecedor (sem vínculo até a verificação de titularidade)
    const s = await tx.one<{ id: string }>(
      `INSERT INTO suppliers(cnpj, legal_name, trade_name, cnae, city, state, first_seen_source) VALUES ($1,$2,$3,$4,$5,$6,'cadastro')
       ON CONFLICT (cnpj) DO UPDATE SET cnae = coalesce(suppliers.cnae, EXCLUDED.cnae) RETURNING id`,
      [d.cnpj, d.legal_name, d.trade_name ?? null, d.cnae ?? null, d.city, d.state]);
    await tx.exec(
      `INSERT INTO supplier_claims(supplier_id, claimant_org_id, claimant_user_id, relationship, justification)
       VALUES ($1,$2,$3,'titular','Cadastro inicial da empresa na plataforma. Pendente de verificação de titularidade/representação.')`,
      [s!.id, o!.id, u!.id]);
    await audit(tx, { id: u!.id, role: "user" }, "cadastro_fornecedor", "organization", o!.id, { cnpj: d.cnpj });
    return { userId: u!.id, orgId: o!.id };
  });
  if ("error" in res) return { error: res.error };
  await createSession(res.userId, (await headers()).get("user-agent"), res.orgId);
  redirect("/fornecedor/assinatura?bemvindo=1");
}

const govSchema = z.object({
  cnpj: cnpjSchema,
  legal_name: text(200).pipe(z.string().min(3, "Informe o nome da instituição")),
  sphere: z.enum(["federal", "estadual", "distrital", "municipal"], { message: "Selecione a esfera" }),
  power: z.enum(["executivo", "legislativo", "judiciario", "ministerio_publico", "tribunal_contas", "defensoria", "autarquia_fundacao", "empresa_estatal", "consorcio", "outro"], { message: "Selecione o poder" }),
  state: ufSchema,
  city: text(80).pipe(z.string().min(2, "Informe o município")),
  address: optText(300),
  full_name: text(120).pipe(z.string().min(3, "Informe o nome do responsável")),
  responsible_title: text(120).pipe(z.string().min(2, "Informe o cargo")),
  email: emailSchema,
  phone: text(30).pipe(z.string().min(8, "Informe o telefone")),
  password: passwordSchema,
  accept_terms: consent,
});

const isInstitutionalEmail = (email: string) => /\.(gov|leg|jus|mp|def|tc|mil)\.br$|\.gov\.br$|\.(?:[a-z]{2})\.gov\.br$|\.edu\.br$/i.test(email.split("@")[1] ?? "");

export async function signupGovAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const rl = await limitByIp("signup", 8, 60 * 60_000);
  if (!rl.ok) return { error: "Limite de cadastros atingido. Tente mais tarde." };
  const p = govSchema.safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fieldErrors(p.error) };
  const d = p.data;
  const hash = await hashPassword(d.password);
  const res = await systemDb(async (tx) => {
    if (await tx.one("SELECT 1 FROM users WHERE email = $1", [d.email])) return { error: "Já existe uma conta com este e-mail." };
    if (await tx.one("SELECT 1 FROM organizations WHERE kind = 'government' AND cnpj = $1", [d.cnpj]))
      return { error: "Este órgão já possui conta. Solicite ao gestor da conta institucional que inclua seu usuário." };
    const u = await tx.one<{ id: string }>(
      `INSERT INTO users(email, password_hash, full_name, phone, terms_accepted_at, privacy_accepted_at) VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
      [d.email, hash, d.full_name, d.phone]);
    const notes = isInstitutionalEmail(d.email) ? null : "E-mail informado não pertence a domínio institucional — verificar vínculo.";
    const o = await tx.one<{ id: string }>(
      `INSERT INTO organizations(kind, cnpj, legal_name, email, phone, address, city, state, sphere, power, responsible_name, responsible_title, verification_notes)
       VALUES ('government',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [d.cnpj, d.legal_name, d.email, d.phone, d.address ?? null, d.city, d.state, d.sphere, d.power, d.full_name, d.responsible_title, notes]);
    await tx.exec("INSERT INTO organization_members(organization_id, user_id, role, job_title) VALUES ($1,$2,'owner',$3)", [o!.id, u!.id, d.responsible_title]);
    await tx.exec(
      `INSERT INTO government_entities(cnpj, name, sphere, state, city) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cnpj) DO NOTHING`,
      [d.cnpj, d.legal_name, d.sphere, d.state, d.city]);
    // Período de avaliação configurável (plano 'orgao_avaliacao')
    const trial = await tx.one<{ id: string; days: number }>(
      "SELECT id, coalesce((features->>'trial_days')::int, 0) AS days FROM subscription_plans WHERE code = 'orgao_avaliacao' AND active");
    if (trial && trial.days > 0)
      await tx.exec(
        `INSERT INTO subscriptions(organization_id, plan_id, status, price_cents, started_at, current_period_start, current_period_end, provider, notes)
         VALUES ($1,$2,'ativa',0,now(),now(),now() + ($3 || ' days')::interval,'cortesia','Período de avaliação automático')`,
        [o!.id, trial.id, String(trial.days)]);
    await audit(tx, { id: u!.id, role: "user" }, "cadastro_orgao", "organization", o!.id, { cnpj: d.cnpj });
    return { userId: u!.id, orgId: o!.id };
  });
  if ("error" in res) return { error: res.error };
  await createSession(res.userId, (await headers()).get("user-agent"), res.orgId);
  redirect("/orgao?bemvindo=1");
}

// ------------------------------------------------------------------ Recuperação de senha
export async function requestResetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const rl = await limitByIp("reset", 5, 60 * 60_000);
  if (!rl.ok) return { error: "Muitas solicitações. Tente mais tarde." };
  const email = emailSchema.safeParse(fd.get("email"));
  const generic = { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha em instantes." };
  if (!email.success) return generic;
  await systemDb(async (tx) => {
    const u = await tx.one<{ id: string }>("SELECT id FROM users WHERE email = $1 AND status = 'active'", [email.data]);
    if (!u) return;
    const token = randomBytes(32).toString("base64url");
    await tx.exec("INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [sha256(token), u.id]);
    const link = `${env.appUrl}/redefinir-senha/${token}`;
    await queueEmail(tx, email.data, "Redefinição de senha", `Para redefinir sua senha, acesse: ${link}\nO link expira em 1 hora. Se você não solicitou, ignore esta mensagem.`);
    await audit(tx, { id: u.id, role: "user" }, "senha_reset_solicitado", "user", u.id);
    if (!env.isProd) console.info(`[dev] link de redefinição: ${link}`);
  });
  return generic;
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({ token: z.string().min(20).max(100), password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] })
    .safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: fieldErrors(p.error) };
  const hash = await hashPassword(p.data.password);
  const ok = await systemDb(async (tx) => {
    const t = await tx.one<{ user_id: string }>(
      "UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id", [sha256(p.data.token)]);
    if (!t) return false;
    await tx.exec("UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1", [t.user_id, hash]);
    await revokeAllSessions(t.user_id, tx);
    await audit(tx, { id: t.user_id, role: "user" }, "senha_redefinida", "user", t.user_id);
    return true;
  });
  if (!ok) return { error: "Link inválido ou expirado. Solicite uma nova redefinição." };
  redirect("/entrar?redefinida=1");
}

export async function switchOrgAction(fd: FormData) {
  const user = await getCurrentUser();
  const orgId = String(fd.get("org") ?? "");
  if (!user || !user.memberships.some((m) => m.organization_id === orgId)) return;
  await systemDb((tx) => tx.exec("UPDATE sessions SET active_org_id = $2 WHERE id = $1", [user.sessionId, orgId]));
  const m = user.memberships.find((x) => x.organization_id === orgId)!;
  redirect(m.kind === "supplier" ? "/fornecedor" : "/orgao");
}

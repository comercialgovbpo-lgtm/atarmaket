import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { systemDb, withDb, type DbCtx, type Tx } from "../db";
import { env } from "../env";

export const SESSION_COOKIE = "am_session";
const SESSION_DAYS = 14;

export interface Membership {
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  kind: "supplier" | "government";
  legal_name: string;
  trade_name: string | null;
  cnpj: string;
  verification_status: "pending" | "verified" | "rejected";
}
export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  platform_role: "user" | "admin";
  memberships: Membership[];
  activeOrg: Membership | null;
  sessionId: string;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, userAgent: string | null, activeOrgId?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await systemDb((tx) =>
    tx.exec("INSERT INTO sessions(id, user_id, expires_at, user_agent, active_org_id) VALUES ($1,$2,$3,$4,$5)", [
      sha256(token), userId, expires, userAgent?.slice(0, 300) ?? null, activeOrgId ?? null,
    ]),
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await systemDb((tx) => tx.exec("DELETE FROM sessions WHERE id = $1", [sha256(token)]));
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string, tx?: Tx) {
  const run = (t: Tx) => t.exec("DELETE FROM sessions WHERE user_id = $1", [userId]);
  return tx ? run(tx) : systemDb(run);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sid = sha256(token);
  return systemDb(async (tx) => {
    const u = await tx.one<{ id: string; email: string; full_name: string; platform_role: "user" | "admin"; active_org_id: string | null }>(
      `SELECT u.id, u.email, u.full_name, u.platform_role, s.active_org_id
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now() AND u.status = 'active'`, [sid]);
    if (!u) return null;
    const memberships = await tx.many<Membership>(
      `SELECT m.organization_id, m.role, o.kind, o.legal_name, o.trade_name, o.cnpj, o.verification_status
         FROM organization_members m JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = $1 ORDER BY m.created_at`, [u.id]);
    const activeOrg = memberships.find((m) => m.organization_id === u.active_org_id) ?? memberships[0] ?? null;
    return { id: u.id, email: u.email, full_name: u.full_name, platform_role: u.platform_role, memberships, activeOrg, sessionId: sid };
  });
});

export function ctxFor(user: CurrentUser | null): DbCtx {
  if (!user) return { role: "anon" };
  return { userId: user.id, role: user.platform_role === "admin" ? "admin" : "user" };
}

/** Executa com o contexto RLS do usuário autenticado (ou anônimo). */
export async function userDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withDb(ctxFor(await getCurrentUser()), fn);
}

export async function requireUser(next?: string): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/entrar${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

export async function requireOrg(kind: "supplier" | "government", next?: string) {
  const user = await requireUser(next);
  const org = user.activeOrg?.kind === kind ? user.activeOrg : user.memberships.find((m) => m.kind === kind);
  if (!org) redirect(user.platform_role === "admin" ? "/admin" : "/painel");
  return { user, org };
}

export async function requireAdmin() {
  const user = await requireUser("/admin");
  if (user.platform_role !== "admin") redirect("/");
  return user;
}

export const canManageOrg = (m: Membership) => m.role === "owner" || m.role === "admin";
export const canWriteOrg = (m: Membership) => m.role !== "viewer";

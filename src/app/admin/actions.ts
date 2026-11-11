"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { requireAdmin, revokeAllSessions } from "@/lib/auth/session";
import { withDb, type Tx } from "@/lib/db";
import { notifyUsers, orgUserIds, queueEmail } from "@/lib/notify";
import { addPeriod } from "@/lib/payments";
import { expireAtas, runItemsBackfill, runPncpSync } from "@/lib/sync/pncp-sync";
import { MODERATION_TARGETS } from "@/lib/atas/status";
import { formDataToObject, optText, parseBrNumber, text, uuidSchema } from "@/lib/validators";

async function adminDb<T>(fn: (tx: Tx, admin: { id: string; role: string }) => Promise<T>) {
  const a = await requireAdmin();
  return withDb({ userId: a.id, role: "admin" }, (tx) => fn(tx, { id: a.id, role: "admin" }));
}

// ------------------------------------------------------------------ Moderação de atas
export async function moderateAtaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({
    ata_id: uuidSchema, status: z.enum(MODERATION_TARGETS as [string, ...string[]]), reason: optText(2000), moderation_notes: optText(4000),
    documents_verified: z.string().optional(), supplier_confirmed: z.string().optional(), validity_confirmed: z.string().optional(),
    availability_checked: z.string().optional(), featured: z.string().optional(), category_id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()),
  }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: "Dados inválidos." };
  const d = p.data;
  if (d.status === "rejeitada" && !d.reason) return { error: "Informe o motivo da rejeição (será exibido ao fornecedor)." };
  const r = await adminDb(async (tx, admin) => {
    const old = await tx.one<{ status: string; submitted_by_org_id: string | null; ata_number: string; published_at: Date | null; availability_checked_at: Date | null }>(
      "SELECT status, submitted_by_org_id, ata_number, published_at, availability_checked_at FROM price_registration_atas WHERE id = $1 FOR UPDATE", [d.ata_id]);
    if (!old) return null;
    const isPublic = !["rascunho", "em_validacao", "rejeitada"].includes(d.status);
    await tx.exec(
      `UPDATE price_registration_atas SET status = $2, status_updated_at = CASE WHEN status <> $2 THEN now() ELSE status_updated_at END,
          moderation_notes = $3, documents_verified = $4, supplier_confirmed = $5, validity_confirmed = $6,
          availability_checked_at = CASE WHEN $7 THEN coalesce(availability_checked_at, now()) ELSE NULL END,
          featured = $8, category_id = coalesce($9, category_id), category_auto = CASE WHEN $9 IS NULL THEN category_auto ELSE false END,
          published_at = CASE WHEN $10 THEN coalesce(published_at, now()) ELSE published_at END
        WHERE id = $1`,
      [d.ata_id, d.status, d.moderation_notes ?? null, d.documents_verified === "on", d.supplier_confirmed === "on", d.validity_confirmed === "on",
       d.availability_checked === "on", d.featured === "on", d.category_id ?? null, isPublic]);
    if (old.status !== d.status)
      await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)", [d.ata_id, old.status, d.status, admin.id, d.reason ?? "Moderação"]);
    await audit(tx, admin, "ata_moderada", "ata", d.ata_id, { de: old.status, para: d.status });
    if (old.submitted_by_org_id && old.status !== d.status) {
      const ids = await orgUserIds(tx, old.submitted_by_org_id);
      await notifyUsers(tx, ids, { title: d.status === "rejeitada" ? `Ata ${old.ata_number} não aprovada` : `Ata ${old.ata_number}: ${d.status.replaceAll("_", " ")}`, body: d.reason, link: `/fornecedor/atas/${d.ata_id}`, dedupeKey: `mod:${d.ata_id}:${Date.now()}` });
    }
    return true;
  });
  if (!r) return { error: "Ata não encontrada." };
  revalidatePath(`/admin/atas/${d.ata_id}`);
  return { ok: true, message: "Moderação registrada." };
}

export async function assessAtaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ataId = uuidSchema.safeParse(fd.get("ata_id"));
  if (!ataId.success) return { error: "Ata inválida." };
  const criteria: Record<string, { ok: boolean | null; note?: string }> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("c_")) criteria[k.slice(2)] = { ok: v === "sim" ? true : v === "nao" ? false : null, note: String(fd.get(`n_${k.slice(2)}`) ?? "") || undefined };
  const conclusion = z.enum(["sem_impedimento_aparente", "requer_analise_adicional", "impedimento_identificado"]).safeParse(fd.get("conclusion"));
  if (!conclusion.success) return { error: "Selecione a conclusão." };
  const caveats = optText(3000).parse(fd.get("caveats") ?? undefined);
  await adminDb(async (tx, admin) => {
    await tx.exec("INSERT INTO ata_adhesion_assessments(ata_id, assessed_by, scope, criteria, conclusion, caveats) VALUES ($1,$2,'plataforma',$3,$4,$5)",
      [ataId.data, admin.id, JSON.stringify(criteria), conclusion.data, caveats ?? null]);
    await audit(tx, admin, "analise_adesao_plataforma", "ata", ataId.data, { conclusion: conclusion.data });
  });
  revalidatePath(`/admin/atas/${ataId.data}`);
  return { ok: true, message: "Análise registrada (exibida na página pública com as ressalvas)." };
}

export async function markDuplicateAction(fd: FormData) {
  const p = z.object({ ata_id: uuidSchema, duplicate_of: z.preprocess((v) => (v === "" ? null : v), uuidSchema.nullable()) }).safeParse(formDataToObject(fd));
  if (!p.success || p.data.ata_id === p.data.duplicate_of) return;
  await adminDb(async (tx, admin) => {
    await tx.exec("UPDATE price_registration_atas SET duplicate_of = $2 WHERE id = $1", [p.data.ata_id, p.data.duplicate_of]);
    await audit(tx, admin, p.data.duplicate_of ? "ata_marcada_duplicada" : "ata_desmarcada_duplicada", "ata", p.data.ata_id, { de: p.data.duplicate_of });
  });
  revalidatePath(`/admin/atas/${p.data.ata_id}`);
}

// ------------------------------------------------------------------ Organizações, usuários e reivindicações
export async function verifyOrgAction(fd: FormData) {
  const p = z.object({ id: uuidSchema, status: z.enum(["verified", "rejected", "pending"]), notes: optText(2000) }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await adminDb(async (tx, admin) => {
    const o = await tx.one<{ kind: string; cnpj: string }>(
      "UPDATE organizations SET verification_status = $2, verification_notes = coalesce($3, verification_notes), verified_at = CASE WHEN $2 = 'verified' THEN now() END, verified_by = $4 WHERE id = $1 RETURNING kind, cnpj",
      [p.data.id, p.data.status, p.data.notes ?? null, admin.id]);
    // Órgão verificado: vincula a entidade pública correspondente
    if (o?.kind === "government" && p.data.status === "verified")
      await tx.exec("UPDATE government_entities SET organization_id = $1 WHERE cnpj = $2 AND organization_id IS NULL", [p.data.id, o.cnpj]);
    await notifyUsers(tx, await orgUserIds(tx, p.data.id), { title: p.data.status === "verified" ? "Cadastro institucional verificado" : "Atualização na verificação do cadastro", body: p.data.notes, link: "/painel", dedupeKey: `ver:${p.data.id}:${p.data.status}` });
    await audit(tx, admin, "organizacao_verificacao", "organization", p.data.id, { status: p.data.status });
  });
  revalidatePath("/admin/organizacoes");
}

export async function reviewClaimAction(fd: FormData) {
  const p = z.object({ id: uuidSchema, decision: z.enum(["aprovada", "rejeitada"]), notes: optText(2000) }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await adminDb(async (tx, admin) => {
    const c = await tx.one<{ supplier_id: string; ata_id: string | null; claimant_org_id: string; relationship: string; status: string }>(
      "SELECT supplier_id, ata_id, claimant_org_id, relationship, status FROM supplier_claims WHERE id = $1 FOR UPDATE", [p.data.id]);
    if (!c || c.status !== "pendente") return;
    await tx.exec("UPDATE supplier_claims SET status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4 WHERE id = $1", [p.data.id, p.data.decision, admin.id, p.data.notes ?? null]);
    if (p.data.decision === "aprovada") {
      if (c.relationship === "titular") {
        await tx.exec("UPDATE suppliers SET organization_id = $2 WHERE id = $1", [c.supplier_id, c.claimant_org_id]);
        await tx.exec("UPDATE organizations SET verification_status = 'verified', verified_at = now(), verified_by = $2 WHERE id = $1 AND verification_status = 'pending'", [c.claimant_org_id, admin.id]);
        // Solicitações que aguardavam o fornecedor passam a ser entregues
        const pending = await tx.many<{ id: string; ata_id: string; requester_org_id: string; contact_name: string; contact_email: string; contact_phone: string | null; kind: string }>(
          "UPDATE contact_requests SET status = 'enviada' WHERE supplier_id = $1 AND status = 'aguardando_fornecedor' RETURNING id, ata_id, requester_org_id, contact_name, contact_email, contact_phone, kind", [c.supplier_id]);
        for (const r of pending) {
          const gov = await tx.one<{ legal_name: string }>("SELECT legal_name FROM organizations WHERE id = $1", [r.requester_org_id]);
          await tx.exec(
            `INSERT INTO commercial_opportunities(supplier_org_id, contact_request_id, ata_id, title, government_name, government_org_id, contact_name, contact_email, contact_phone)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (contact_request_id) DO NOTHING`,
            [c.claimant_org_id, r.id, r.ata_id, r.kind === "interesse_comercial" ? "Interesse comercial" : "Pedido de informações", gov?.legal_name ?? "Órgão público", r.requester_org_id, r.contact_name, r.contact_email, r.contact_phone]);
        }
      }
      if (c.ata_id) {
        await tx.exec("UPDATE price_registration_atas SET supplier_id = coalesce(supplier_id, $2), supplier_confirmed = true WHERE id = $1", [c.ata_id, c.supplier_id]);
        const st = await tx.one<{ status: string }>("SELECT status FROM price_registration_atas WHERE id = $1", [c.ata_id]);
        if (st && ["importada", "cadastrada", "verificada"].includes(st.status)) {
          await tx.exec("UPDATE price_registration_atas SET status = 'fornecedor_confirmado', status_updated_at = now() WHERE id = $1", [c.ata_id]);
          await tx.exec("INSERT INTO ata_status_history(ata_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,'fornecedor_confirmado',$3,'Reivindicação de titularidade aprovada')", [c.ata_id, st.status, admin.id]);
        }
      }
    }
    await notifyUsers(tx, await orgUserIds(tx, c.claimant_org_id), { title: `Reivindicação ${p.data.decision}`, body: p.data.notes, link: "/fornecedor/reivindicar", dedupeKey: `claim:${p.data.id}` });
    await audit(tx, admin, "reivindicacao_" + p.data.decision, "supplier_claim", p.data.id);
  });
  revalidatePath("/admin/reivindicacoes");
}

export async function userAdminAction(fd: FormData) {
  const p = z.object({ id: uuidSchema, op: z.enum(["suspender", "reativar", "promover", "rebaixar"]) }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await adminDb(async (tx, admin) => {
    if (p.data.id === admin.id) return;
    const sql = { suspender: "status = 'suspended'", reativar: "status = 'active'", promover: "platform_role = 'admin'", rebaixar: "platform_role = 'user'" }[p.data.op];
    await tx.exec(`UPDATE users SET ${sql} WHERE id = $1 AND status <> 'deleted'`, [p.data.id]);
    if (p.data.op === "suspender") await revokeAllSessions(p.data.id, tx);
    await audit(tx, admin, `usuario_${p.data.op}`, "user", p.data.id);
  });
  revalidatePath("/admin/usuarios");
}

// ------------------------------------------------------------------ Planos, categorias, assinaturas
export async function savePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({
    id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()), code: z.string().regex(/^[a-z0-9_]{3,40}$/, "Código: letras minúsculas, números e _"),
    audience: z.enum(["supplier", "government"]), name: text(80).pipe(z.string().min(2)), description: optText(500), price: z.string(),
    billing_interval: z.enum(["month", "year"]), ata_limit: z.string().optional(), user_limit: z.string().optional(), features: z.string(), highlights: z.string().optional(),
    active: z.string().optional(), sort_order: z.coerce.number().int().default(0),
  }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  let features: Record<string, unknown>;
  try { features = JSON.parse(p.data.features); if (typeof features !== "object" || Array.isArray(features)) throw 0; } catch { return { error: "Recursos: JSON inválido." }; }
  const price = parseBrNumber(p.data.price);
  if (price == null || price < 0) return { error: "Preço inválido." };
  const lim = (v?: string) => (v ? Number(v) : null);
  await adminDb(async (tx, admin) => {
    const vals = [p.data.code, p.data.audience, p.data.name, p.data.description ?? null, Math.round(price * 100), p.data.billing_interval, lim(p.data.ata_limit), lim(p.data.user_limit),
      JSON.stringify(features), (p.data.highlights ?? "").split("\n").map((s) => s.trim()).filter(Boolean), p.data.active === "on", p.data.sort_order];
    if (p.data.id) await tx.exec(`UPDATE subscription_plans SET code=$2, audience=$3, name=$4, description=$5, price_cents=$6, billing_interval=$7, ata_limit=$8, user_limit=$9, features=$10, highlights=$11, active=$12, sort_order=$13 WHERE id=$1`, [p.data.id, ...vals]);
    else await tx.exec(`INSERT INTO subscription_plans(code, audience, name, description, price_cents, billing_interval, ata_limit, user_limit, features, highlights, active, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, vals);
    await audit(tx, admin, "plano_salvo", "plan", p.data.id ?? p.data.code, { price_cents: Math.round(price * 100) });
  });
  revalidatePath("/admin/planos");
  return { ok: true, message: "Plano salvo. Assinaturas existentes mantêm o preço contratado." };
}

export async function saveCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({ id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()), slug: z.string().regex(/^[a-z0-9-]{2,40}$/), name: text(80).pipe(z.string().min(2)), keywords: z.string().optional(), icon: optText(30), sort_order: z.coerce.number().int().default(50), active: z.string().optional() }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: "Dados inválidos (slug: minúsculas, números e hífen)." };
  const kws = (p.data.keywords ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  await adminDb(async (tx, admin) => {
    if (p.data.id) await tx.exec("UPDATE categories SET slug=$2, name=$3, keywords=$4, icon=$5, sort_order=$6, active=$7 WHERE id=$1", [p.data.id, p.data.slug, p.data.name, kws, p.data.icon ?? null, p.data.sort_order, p.data.active === "on"]);
    else await tx.exec("INSERT INTO categories(slug, name, keywords, icon, sort_order, active) VALUES ($1,$2,$3,$4,$5,$6)", [p.data.slug, p.data.name, kws, p.data.icon ?? null, p.data.sort_order, p.data.active === "on"]);
    await audit(tx, admin, "categoria_salva", "category", p.data.id ?? p.data.slug);
  });
  revalidatePath("/admin/categorias");
  return { ok: true, message: "Categoria salva." };
}

/** Registra pagamento recebido fora do gateway (PIX, boleto, empenho) e ativa/renova a assinatura. */
export async function activateSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({ id: uuidSchema, method: z.enum(["pix", "boleto", "transferencia", "empenho", "cortesia"]), reference: text(200).pipe(z.string().min(2, "Informe a referência do pagamento/contrato")), amount: z.string(), period_end: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()) }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const amount = parseBrNumber(p.data.amount);
  if (amount == null || amount < 0) return { error: "Valor inválido." };
  await adminDb(async (tx, admin) => {
    const s = await tx.one<{ organization_id: string; current_period_end: Date | null; interval: "month" | "year" }>(
      "SELECT s.organization_id, s.current_period_end, p.billing_interval AS interval FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.id = $1", [p.data.id]);
    if (!s) return;
    const start = s.current_period_end && s.current_period_end > new Date() ? s.current_period_end : new Date();
    const end = p.data.period_end ? new Date(p.data.period_end + "T23:59:59-03:00") : addPeriod(start, s.interval);
    await tx.exec(`UPDATE subscriptions SET status = 'ativa', started_at = coalesce(started_at, now()), current_period_start = $2, current_period_end = $3,
                   provider = coalesce(provider, 'manual'), contract_reference = CASE WHEN $4 = 'empenho' THEN $5 ELSE contract_reference END WHERE id = $1`,
      [p.data.id, start, end, p.data.method, p.data.reference]);
    await tx.exec("INSERT INTO payments(subscription_id, organization_id, amount_cents, status, provider, provider_payment_id, method, paid_at) VALUES ($1,$2,$3,'pago','manual',$4,$5,now())",
      [p.data.id, s.organization_id, Math.round(amount * 100), `manual:${p.data.id}:${Date.now()}`, p.data.method]);
    await notifyUsers(tx, await orgUserIds(tx, s.organization_id), { title: "Plano ativado", body: `Vigente até ${end.toLocaleDateString("pt-BR")}`, link: "/painel", dedupeKey: `act:${p.data.id}:${end.toISOString()}` });
    await audit(tx, admin, "assinatura_ativada_manual", "subscription", p.data.id, { method: p.data.method, reference: p.data.reference, amount });
  });
  revalidatePath("/admin/assinaturas");
  return { ok: true, message: "Pagamento registrado e assinatura ativada." };
}

export async function cancelSubscriptionAdminAction(fd: FormData) {
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  await adminDb(async (tx, admin) => {
    await tx.exec("UPDATE subscriptions SET status = 'cancelada', canceled_at = now() WHERE id = $1", [id.data]);
    await audit(tx, admin, "assinatura_cancelada_admin", "subscription", id.data);
  });
  revalidatePath("/admin/assinaturas");
}

// ------------------------------------------------------------------ Fontes e sincronização
export async function triggerSyncAction(fd: FormData) {
  const admin = await requireAdmin();
  const p = z.object({ mode: z.enum(["atualizacao", "vigencia"]), days: z.coerce.number().int().min(1).max(30), pages: z.coerce.number().int().min(1).max(200), items: z.string().optional() }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await withDb({ userId: admin.id, role: "admin" }, (tx) => audit(tx, { id: admin.id, role: "admin" }, "sincronizacao_disparada", "source", "pncp", p.data));
  const to = new Date();
  const from = p.data.mode === "vigencia" ? to : new Date(to.getTime() - p.data.days * 86_400_000);
  after(async () => { await runPncpSync({ mode: p.data.mode, from, to, maxPages: p.data.pages, fetchItems: p.data.items === "on", triggeredBy: `admin:${admin.email}` }).catch((e) => console.error("sync", e)); });
  redirect("/admin/fontes?disparada=1");
}

export async function triggerItemsBackfillAction(fd: FormData) {
  const admin = await requireAdmin();
  const limit = z.coerce.number().int().min(1).max(500).catch(50).parse(fd.get("limit"));
  await withDb({ userId: admin.id, role: "admin" }, (tx) => audit(tx, { id: admin.id, role: "admin" }, "backfill_itens_disparado", "source", "pncp", { limit }));
  after(async () => { await runItemsBackfill(limit, `admin:${admin.email}`).catch((e) => console.error("itens", e)); });
  redirect("/admin/fontes?disparada=1");
}

export async function expireNowAction() {
  await requireAdmin();
  await expireAtas();
  revalidatePath("/admin/fontes");
}

export async function saveSourceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({ id: uuidSchema, active: z.string().optional(), config: z.string(), terms_notes: optText(2000) }).safeParse(formDataToObject(fd));
  if (!p.success) return { error: "Dados inválidos." };
  let config: unknown;
  try { config = JSON.parse(p.data.config); } catch { return { error: "Configuração: JSON inválido." }; }
  await adminDb(async (tx, admin) => {
    await tx.exec("UPDATE ata_sources SET active = $2, config = $3, terms_notes = $4, updated_at = now() WHERE id = $1", [p.data.id, p.data.active === "on", JSON.stringify(config), p.data.terms_notes ?? null]);
    await audit(tx, admin, "fonte_atualizada", "source", p.data.id);
  });
  revalidatePath("/admin/fontes");
  return { ok: true, message: "Fonte atualizada." };
}

// ------------------------------------------------------------------ LGPD
export async function resolveDsrAction(fd: FormData) {
  const p = z.object({ id: uuidSchema, status: z.enum(["em_atendimento", "concluida", "indeferida"]), response: optText(3000) }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await adminDb(async (tx, admin) => {
    const r = await tx.one<{ email: string }>("UPDATE data_subject_requests SET status = $2, response = $3, resolved_at = CASE WHEN $2 IN ('concluida','indeferida') THEN now() END WHERE id = $1 RETURNING email", [p.data.id, p.data.status, p.data.response ?? null]);
    if (r && p.data.response) await queueEmail(tx, r.email, "Sua solicitação sobre dados pessoais", p.data.response);
    await audit(tx, admin, "lgpd_solicitacao_" + p.data.status, "data_subject_request", p.data.id);
  });
  revalidatePath("/admin/lgpd");
}

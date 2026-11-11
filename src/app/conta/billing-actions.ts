"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { canManageOrg, getCurrentUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { notifyUsers } from "@/lib/notify";
import { activeProvider } from "@/lib/payments";
import { optText, uuidSchema } from "@/lib/validators";

/**
 * Solicita/contrata um plano. Fornecedores: checkout no provedor configurado (sem simulação).
 * Órgãos: registra pedido de contratação; a ativação ocorre após o procedimento administrativo do órgão.
 */
export async function requestPlanAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user?.activeOrg || !canManageOrg(user.activeOrg)) redirect("/entrar");
  const org = user.activeOrg;
  const planId = uuidSchema.parse(fd.get("plan_id"));
  const notes = optText(1000).parse(fd.get("notes") ?? undefined);
  const base = org.kind === "supplier" ? "/fornecedor/assinatura" : "/orgao/licenca";

  const r = await systemDb(async (tx) => {
    const plan = await tx.one<{ id: string; name: string; price_cents: number; billing_interval: "month" | "year"; audience: string; code: string }>(
      "SELECT id, name, price_cents, billing_interval, audience, code FROM subscription_plans WHERE id = $1 AND active", [planId]);
    if (!plan || plan.audience !== org.kind || plan.code === "orgao_avaliacao") return { err: "plano" };
    const pending = await tx.one("SELECT 1 FROM subscriptions WHERE organization_id = $1 AND plan_id = $2 AND status IN ('aguardando_pagamento','aguardando_contratacao')", [org.organization_id, plan.id]);
    if (pending) return { err: "pendente" };
    const status = org.kind === "government" ? "aguardando_contratacao" : "aguardando_pagamento";
    const sub = await tx.one<{ id: string }>(
      "INSERT INTO subscriptions(organization_id, plan_id, status, price_cents, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [org.organization_id, plan.id, status, plan.price_cents, notes ?? null]);
    await audit(tx, { id: user.id, role: "user" }, "plano_solicitado", "subscription", sub!.id, { plan: plan.code });
    const admins = await tx.many<{ id: string }>("SELECT id FROM users WHERE platform_role = 'admin' AND status = 'active'");
    await notifyUsers(tx, admins.map((a) => a.id), { title: `Nova solicitação de plano: ${plan.name}`, body: org.legal_name, link: "/admin/assinaturas", dedupeKey: `sub:${sub!.id}` });
    return { sub: sub!.id, plan };
  });
  if ("err" in r) redirect(`${base}?erro=${r.err}`);

  const provider = org.kind === "supplier" ? activeProvider() : null;
  if (provider && r.plan.price_cents > 0) {
    const checkout = await provider.createCheckout({
      subscriptionId: r.sub, organizationId: org.organization_id, planName: r.plan.name, amountCents: r.plan.price_cents,
      interval: r.plan.billing_interval, customerEmail: user.email,
      successUrl: `${env.appUrl}${base}?pagamento=retorno`, cancelUrl: `${env.appUrl}${base}?pagamento=cancelado`,
    });
    await systemDb(async (tx) => {
      await tx.exec("UPDATE subscriptions SET provider = $2, provider_subscription_id = $3 WHERE id = $1", [r.sub, checkout.provider, checkout.providerRef]);
      await tx.exec(
        "INSERT INTO payments(subscription_id, organization_id, amount_cents, status, provider, provider_payment_id, checkout_url) VALUES ($1,$2,$3,'pendente',$4,$5,$6)",
        [r.sub, org.organization_id, r.plan.price_cents, checkout.provider, `checkout:${checkout.providerRef}`, checkout.checkoutUrl]);
    });
    redirect(checkout.checkoutUrl);
  }
  redirect(`${base}?solicitado=1`);
}

export async function cancelSubscriptionAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user?.activeOrg || !canManageOrg(user.activeOrg)) redirect("/entrar");
  const id = uuidSchema.parse(fd.get("id"));
  await systemDb(async (tx) => {
    const n = await tx.exec(
      `UPDATE subscriptions SET status = CASE WHEN status IN ('aguardando_pagamento','aguardando_contratacao') THEN 'cancelada' ELSE status END,
              canceled_at = now(), notes = coalesce(notes || E'\\n','') || 'Cancelamento solicitado pelo cliente; acesso mantido até o fim do período pago.'
        WHERE id = $1 AND organization_id = $2`, [id, user.activeOrg!.organization_id]);
    if (n) await audit(tx, { id: user.id, role: "user" }, "assinatura_cancelamento_solicitado", "subscription", id);
  });
  redirect(user.activeOrg.kind === "supplier" ? "/fornecedor/assinatura" : "/orgao/licenca");
}

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Camada de pagamentos independente de provedor.
 * Nenhum pagamento é simulado: sem provedor configurado, a assinatura fica "aguardando_pagamento"
 * e o administrador pode registrar manualmente um pagamento recebido por outro meio (provider = "manual").
 */
export interface CheckoutInput {
  subscriptionId: string;
  organizationId: string;
  planName: string;
  amountCents: number;
  interval: "month" | "year";
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}
export interface CheckoutResult { provider: string; checkoutUrl: string; providerRef: string }
export interface WebhookEvent { type: "payment_succeeded" | "payment_failed" | "subscription_canceled" | "ignored"; subscriptionId?: string; providerPaymentId?: string; amountCents?: number; raw: unknown }

export interface PaymentProvider {
  name: string;
  configured(): boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
}

const stripe: PaymentProvider = {
  name: "stripe",
  configured: () => Boolean(env.stripeSecret),
  async createCheckout(i) {
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "brl",
      "line_items[0][price_data][unit_amount]": String(i.amountCents),
      "line_items[0][price_data][product_data][name]": i.planName,
      "line_items[0][price_data][recurring][interval]": i.interval,
      customer_email: i.customerEmail,
      client_reference_id: i.subscriptionId,
      "metadata[subscription_id]": i.subscriptionId,
      "subscription_data[metadata][subscription_id]": i.subscriptionId,
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${env.stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const json = (await res.json()) as { id: string; url: string; error?: { message: string } };
    if (!res.ok) throw new Error(json.error?.message ?? "Erro no Stripe");
    return { provider: "stripe", checkoutUrl: json.url, providerRef: json.id };
  },
  async parseWebhook(raw, headers) {
    const sig = headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
    const expected = createHmac("sha256", env.stripeWebhookSecret).update(`${parts.t}.${raw}`).digest("hex");
    if (!parts.v1 || !safeEq(expected, parts.v1) || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new Error("Assinatura inválida");
    const ev = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
    const o = ev.data.object as { id: string; amount_paid?: number; amount_total?: number; metadata?: Record<string, string>; subscription_details?: { metadata?: Record<string, string> }; parent?: { subscription_details?: { metadata?: Record<string, string> } } };
    const subId = o.metadata?.subscription_id ?? o.subscription_details?.metadata?.subscription_id ?? o.parent?.subscription_details?.metadata?.subscription_id;
    if (ev.type === "invoice.paid") return { type: "payment_succeeded", subscriptionId: subId, providerPaymentId: o.id, amountCents: o.amount_paid, raw: ev };
    if (ev.type === "invoice.payment_failed") return { type: "payment_failed", subscriptionId: subId, providerPaymentId: o.id, raw: ev };
    if (ev.type === "customer.subscription.deleted") return { type: "subscription_canceled", subscriptionId: subId, raw: ev };
    return { type: "ignored", raw: ev };
  },
};

const mercadopago: PaymentProvider = {
  name: "mercadopago",
  configured: () => Boolean(env.mercadoPagoToken),
  async createCheckout(i) {
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.mercadoPagoToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: i.planName, external_reference: i.subscriptionId, payer_email: i.customerEmail, back_url: i.successUrl,
        auto_recurring: { frequency: i.interval === "year" ? 12 : 1, frequency_type: "months", transaction_amount: i.amountCents / 100, currency_id: "BRL" },
      }),
    });
    const json = (await res.json()) as { id: string; init_point: string; message?: string };
    if (!res.ok) throw new Error(json.message ?? "Erro no Mercado Pago");
    return { provider: "mercadopago", checkoutUrl: json.init_point, providerRef: json.id };
  },
  async parseWebhook(raw, headers) {
    // x-signature: "ts=...,v1=..." ; manifesto "id:{data.id};request-id:{x-request-id};ts:{ts};"
    const sig = Object.fromEntries((headers.get("x-signature") ?? "").split(",").map((p) => p.trim().split("=") as [string, string]));
    const ev = JSON.parse(raw) as { type?: string; action?: string; data?: { id?: string } };
    const manifest = `id:${ev.data?.id ?? ""};request-id:${headers.get("x-request-id") ?? ""};ts:${sig.ts};`;
    const expected = createHmac("sha256", env.mercadoPagoWebhookSecret).update(manifest).digest("hex");
    if (!sig.v1 || !safeEq(expected, sig.v1)) throw new Error("Assinatura inválida");
    if (ev.type !== "subscription_authorized_payment" && ev.type !== "payment") return { type: "ignored", raw: ev };
    // Confirma o status consultando a API (não confiar apenas no corpo do webhook)
    const path = ev.type === "payment" ? `/v1/payments/${ev.data?.id}` : `/authorized_payments/${ev.data?.id}`;
    const res = await fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${env.mercadoPagoToken}` } });
    const p = (await res.json()) as { id: string | number; status: string; external_reference?: string; transaction_amount?: number; preapproval_id?: string };
    const subscriptionId = p.external_reference;
    if (p.status === "approved" || p.status === "processed")
      return { type: "payment_succeeded", subscriptionId, providerPaymentId: String(p.id), amountCents: Math.round((p.transaction_amount ?? 0) * 100), raw: p };
    if (p.status === "rejected") return { type: "payment_failed", subscriptionId, providerPaymentId: String(p.id), raw: p };
    return { type: "ignored", raw: p };
  },
};

const providers: Record<string, PaymentProvider> = { stripe, mercadopago };

export function activeProvider(): PaymentProvider | null {
  const p = providers[env.paymentProvider];
  return p && p.configured() ? p : null;
}
export const getProvider = (name: string) => providers[name] ?? null;

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function addPeriod(from: Date, interval: "month" | "year") {
  const d = new Date(from);
  if (interval === "year") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return d;
}

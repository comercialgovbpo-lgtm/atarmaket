import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { systemDb } from "@/lib/db";
import { addPeriod, getProvider } from "@/lib/payments";

/** Webhook do gateway: valida assinatura, registra o pagamento e ativa/renova a assinatura (idempotente). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: name } = await params;
  const provider = getProvider(name);
  if (!provider || !provider.configured()) return NextResponse.json({ error: "Provedor não configurado" }, { status: 404 });
  const raw = await req.text();
  let ev;
  try { ev = await provider.parseWebhook(raw, req.headers); } catch { return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 }); }
  if (ev.type === "ignored" || !ev.subscriptionId) return NextResponse.json({ ok: true });
  await systemDb(async (tx) => {
    const s = await tx.one<{ id: string; organization_id: string; current_period_end: Date | null; interval: "month" | "year"; price_cents: number }>(
      "SELECT s.id, s.organization_id, s.current_period_end, p.billing_interval AS interval, s.price_cents FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.id = $1", [ev.subscriptionId]);
    if (!s) return;
    if (ev.type === "payment_succeeded") {
      const inserted = await tx.exec(
        `INSERT INTO payments(subscription_id, organization_id, amount_cents, status, provider, provider_payment_id, paid_at, raw)
         VALUES ($1,$2,$3,'pago',$4,$5,now(),$6) ON CONFLICT (provider, provider_payment_id) DO NOTHING`,
        [s.id, s.organization_id, ev.amountCents ?? s.price_cents, provider.name, ev.providerPaymentId, JSON.stringify(ev.raw)]);
      if (!inserted) return; // evento repetido
      const start = s.current_period_end && s.current_period_end > new Date() ? s.current_period_end : new Date();
      await tx.exec("UPDATE subscriptions SET status = 'ativa', started_at = coalesce(started_at, now()), current_period_start = $2, current_period_end = $3 WHERE id = $1", [s.id, start, addPeriod(start, s.interval)]);
      await tx.exec("UPDATE payments SET status = 'cancelado' WHERE subscription_id = $1 AND status = 'pendente' AND provider_payment_id LIKE 'checkout:%'", [s.id]);
    } else if (ev.type === "payment_failed") {
      await tx.exec("INSERT INTO payments(subscription_id, organization_id, amount_cents, status, provider, provider_payment_id, raw) VALUES ($1,$2,$3,'falhou',$4,$5,$6) ON CONFLICT DO NOTHING",
        [s.id, s.organization_id, s.price_cents, provider.name, ev.providerPaymentId, JSON.stringify(ev.raw)]);
      await tx.exec("UPDATE subscriptions SET status = 'inadimplente' WHERE id = $1 AND status = 'ativa' AND current_period_end < now()", [s.id]);
    } else if (ev.type === "subscription_canceled") {
      await tx.exec("UPDATE subscriptions SET status = 'cancelada', canceled_at = now() WHERE id = $1", [s.id]);
    }
    await audit(tx, null, `webhook_${ev.type}`, "subscription", s.id, { provider: provider.name });
  });
  return NextResponse.json({ ok: true });
}

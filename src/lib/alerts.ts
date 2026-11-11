import "server-only";
import { systemDb, withDb } from "./db";
import { env } from "./env";
import { notifyUsers } from "./notify";
import { searchAtas, searchSchema } from "./atas/search";

/** Processa alertas: vencimento de atas acompanhadas, novas atas em pesquisas salvas e vencimento das atas do fornecedor. */
export async function runAlerts() {
  let sent = 0;
  // 1) Vencimento de atas acompanhadas (órgãos)
  await systemDb(async (tx) => {
    const due = await tx.many<{ id: string; user_id: string; ata_id: string; ata_number: string; validity_end: string; days: number }>(
      `SELECT al.id, al.user_id, a.id ata_id, a.ata_number, a.validity_end, (a.validity_end - current_date) days
         FROM alerts al JOIN price_registration_atas a ON a.id = al.ata_id
        WHERE al.active AND al.kind = 'vencimento_ata' AND a.validity_end BETWEEN current_date AND current_date + al.days_before`);
    for (const d of due) {
      await notifyUsers(tx, [d.user_id], { title: `Ata ${d.ata_number} vence em ${d.days} dia(s)`, link: `/atas/${d.ata_id}`, dedupeKey: `venc:${d.id}:${d.validity_end}` });
      await tx.exec("UPDATE alerts SET last_triggered_at = now(), last_checked_at = now() WHERE id = $1", [d.id]);
      sent++;
    }
    // 3) Vencimento das atas do fornecedor (planos com expiry_alerts)
    const sup = await tx.many<{ user_id: string; ata_id: string; ata_number: string; validity_end: string }>(
      `SELECT m.user_id, a.id ata_id, a.ata_number, a.validity_end
         FROM price_registration_atas a
         JOIN organization_members m ON m.organization_id = a.submitted_by_org_id OR m.organization_id = (SELECT organization_id FROM suppliers s WHERE s.id = a.supplier_id)
         JOIN subscriptions su ON su.organization_id = m.organization_id AND su.status = 'ativa' AND (su.current_period_end IS NULL OR su.current_period_end > now())
         JOIN subscription_plans p ON p.id = su.plan_id AND (p.features->>'expiry_alerts')::boolean
        WHERE a.status NOT IN ('encerrada','rascunho','rejeitada') AND a.validity_end IN (current_date + 60, current_date + 30, current_date + 7)`);
    for (const s of sup) {
      await notifyUsers(tx, [s.user_id], { title: `Sua ata ${s.ata_number} vence em ${dateDiff(s.validity_end)} dia(s)`, link: `/fornecedor/atas/${s.ata_id}`, dedupeKey: `svenc:${s.ata_id}:${s.validity_end}:${dateDiff(s.validity_end)}` });
      sent++;
    }
  });
  // 2) Novas atas em pesquisas salvas — executa a busca no contexto RLS do próprio usuário
  const searches = await systemDb((tx) => tx.many<{ id: string; user_id: string; name: string; query: unknown; last_checked_at: Date | null; ss_id: string }>(
    `SELECT al.id, al.user_id, s.name, s.query, al.last_checked_at, s.id ss_id FROM alerts al JOIN saved_searches s ON s.id = al.saved_search_id
      WHERE al.active AND al.kind = 'novas_atas_pesquisa'`));
  for (const s of searches) {
    const since = s.last_checked_at ?? new Date(Date.now() - 86_400_000);
    const q = searchSchema.safeParse(s.query);
    if (!q.success) continue;
    const res = await withDb({ userId: s.user_id, role: "user" }, (tx) => searchAtas(tx, { ...q.data, ordem: "recentes" }, { pageSize: 50 }));
    const count = await withDb({ userId: s.user_id, role: "user" }, async (tx) => {
      const ids = res.rows.map((r) => r.id);
      if (!ids.length) return 0;
      return (await tx.one<{ n: number }>("SELECT count(*)::int n FROM price_registration_atas WHERE id = ANY($1::uuid[]) AND created_at > $2", [ids, since]))?.n ?? 0;
    });
    await systemDb(async (tx) => {
      if (count > 0) {
        const qs = new URLSearchParams(Object.entries(q.data).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
        qs.set("ordem", "recentes");
        await notifyUsers(tx, [s.user_id], { title: `${count} nova(s) ata(s) em “${s.name}”`, link: `/atas?${qs}`, dedupeKey: `ss:${s.id}:${new Date().toISOString().slice(0, 10)}` });
        await tx.exec("UPDATE alerts SET last_triggered_at = now() WHERE id = $1", [s.id]);
        sent++;
      }
      await tx.exec("UPDATE alerts SET last_checked_at = now() WHERE id = $1", [s.id]);
    });
  }
  sent += await flushEmails();
  return { sent };
}

const dateDiff = (d: string) => Math.round((new Date(d + "T12:00:00").getTime() - Date.now()) / 86_400_000);

/** Envia e-mails pendentes via provedor HTTP (Resend). Sem provedor, mantém a fila. */
export async function flushEmails(limit = 50): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return 0;
  const rows = await systemDb((tx) => tx.many<{ id: string; to_email: string; subject: string; body_text: string }>(
    "SELECT id, to_email, subject, body_text FROM email_outbox WHERE status = 'pendente' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED", [limit]));
  let ok = 0;
  for (const r of rows) {
    try {
      const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: r.to_email, subject: r.subject, text: `${r.body_text}\n\n—\n${env.appUrl}` }) });
      await systemDb((tx) => tx.exec("UPDATE email_outbox SET status = $2, sent_at = CASE WHEN $2 = 'enviado' THEN now() END, error = $3 WHERE id = $1",
        [r.id, res.ok ? "enviado" : "falhou", res.ok ? null : `HTTP ${res.status}`]));
      if (res.ok) ok++;
    } catch (e) {
      await systemDb((tx) => tx.exec("UPDATE email_outbox SET status = 'falhou', error = $2 WHERE id = $1", [r.id, (e as Error).message]));
    }
  }
  return ok;
}

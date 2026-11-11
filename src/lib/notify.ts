import "server-only";
import type { Tx } from "./db";

/** Notificação interna + fila de e-mail (o envio efetivo é feito pelo worker de e-mail configurado). */
export async function notifyUsers(
  tx: Tx,
  userIds: string[],
  n: { title: string; body?: string; link?: string; dedupeKey?: string; email?: boolean },
) {
  for (const uid of userIds) {
    await tx.exec(
      `INSERT INTO notifications(user_id, title, body, link, dedupe_key) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [uid, n.title, n.body ?? null, n.link ?? null, n.dedupeKey ?? null],
    );
  }
}

export async function queueEmail(tx: Tx, to: string, subject: string, body: string) {
  await tx.exec("INSERT INTO email_outbox(to_email, subject, body_text) VALUES ($1,$2,$3)", [to, subject, body]);
}

export async function orgUserIds(tx: Tx, orgId: string): Promise<string[]> {
  return (await tx.many<{ user_id: string }>("SELECT user_id FROM organization_members WHERE organization_id = $1", [orgId])).map((r) => r.user_id);
}

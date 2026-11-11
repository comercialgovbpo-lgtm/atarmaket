import "server-only";
import type { Tx } from "./db";

export async function audit(
  tx: Tx,
  actor: { id?: string | null; role?: string | null } | null,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  await tx.exec(
    "INSERT INTO audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)",
    [actor?.id ?? null, actor?.role ?? null, action, entityType ?? null, entityId ?? null, JSON.stringify(metadata)],
  );
}

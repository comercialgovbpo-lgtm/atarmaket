import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { withDb, type Tx } from "@/lib/db";

export async function adminRead<T>(fn: (tx: Tx) => Promise<T>) {
  const a = await requireAdmin();
  return withDb({ userId: a.id, role: "admin" }, fn);
}

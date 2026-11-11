import "server-only";
import type { Tx } from "@/lib/db";
import { PUBLIC_STATUSES } from "@/lib/atas/status";

export async function ata_public_check(tx: Tx, id: string) {
  return tx.one<{ id: string; supplier_id: string | null; procurement_record_id: string | null; ata_number: string }>(
    "SELECT id, supplier_id, procurement_record_id, ata_number FROM price_registration_atas WHERE id = $1 AND status = ANY($2) AND status <> 'encerrada'",
    [id, PUBLIC_STATUSES]);
}

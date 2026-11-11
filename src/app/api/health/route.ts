import { NextResponse } from "next/server";
import { anonDb } from "@/lib/db";

/** Verificação de saúde para monitoramento (uptime, balanceador). Não expõe dados sensíveis. */
export async function GET() {
  try {
    const r = await anonDb((tx) => tx.one<{ last: Date | null }>("SELECT max(last_sync_at) AS last FROM ata_sources"));
    return NextResponse.json({ status: "ok", db: "ok", ultimaSincronizacao: r?.last ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "erro", db: "indisponível" }, { status: 503 });
  }
}

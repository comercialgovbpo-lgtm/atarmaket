import { NextResponse } from "next/server";
import { runPncpSync } from "@/lib/sync/pncp-sync";
import { cronAuthorized } from "../auth";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const mode = url.searchParams.get("modo") === "vigencia" ? "vigencia" : "atualizacao";
  const res = await runPncpSync({ mode, maxPages: Number(url.searchParams.get("paginas") ?? 0) || undefined, triggeredBy: "cron" });
  return NextResponse.json({ ...res, details: res.details.slice(0, 10) });
}

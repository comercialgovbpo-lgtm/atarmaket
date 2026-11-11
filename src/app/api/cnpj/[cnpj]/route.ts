import { NextResponse } from "next/server";
import { anonDb, systemDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { isValidCnpj, onlyDigits } from "@/lib/validators";

/** Consulta o CNPJ na base pública já importada (sem serviços externos). */
export async function GET(req: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`cnpj:${ip}`, 30, 60_000).ok) return NextResponse.json({ error: "rate" }, { status: 429 });
  const c = onlyDigits((await params).cnpj);
  if (!isValidCnpj(c)) return NextResponse.json({ valid: false }, { status: 400 });
  const kind = new URL(req.url).searchParams.get("tipo") === "government" ? "government" : "supplier";
  const name = await anonDb((tx) =>
    kind === "government"
      ? tx.one<{ name: string }>("SELECT name FROM government_entities WHERE cnpj = $1", [c])
      : tx.one<{ name: string }>("SELECT legal_name AS name FROM suppliers WHERE cnpj = $1", [c]));
  const registered = await systemDb((tx) => tx.one("SELECT 1 FROM organizations WHERE kind = $1 AND cnpj = $2", [kind, c]));
  return NextResponse.json({ valid: true, name: name?.name ?? null, registered: Boolean(registered) });
}

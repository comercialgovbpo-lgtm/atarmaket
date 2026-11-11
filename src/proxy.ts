import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteções de borda: limite de requisições por IP para APIs e envios de formulário,
 * e verificação de origem em requisições mutáveis (defesa adicional contra CSRF).
 * O limitador em memória vale por instância; em produção distribuída use Redis/Upstash.
 */
const hits = new Map<string, number[]>();
function limited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 20000) hits.clear();
  return arr.length > limit;
}

export function proxy(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { pathname } = req.nextUrl;
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);

  if (mutating && !pathname.startsWith("/api/webhooks/")) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin && origin !== process.env.APP_URL)
      return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
    if (limited(`m:${ip}`, 120, 60_000)) return NextResponse.json({ error: "Muitas requisições" }, { status: 429 });
  }
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/cron/") && limited(`a:${ip}`, 300, 60_000))
    return NextResponse.json({ error: "Muitas requisições" }, { status: 429 });
  if (pathname === "/atas" && limited(`s:${ip}`, 120, 60_000))
    return new NextResponse("Muitas pesquisas em sequência. Aguarde um minuto.", { status: 429 });
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health).*)"] };

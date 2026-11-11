import "server-only";
import { headers } from "next/headers";

/**
 * Rate limiting por janela deslizante em memória (por instância).
 * Em produção com múltiplas instâncias, substitua o "store" por Redis/Upstash mantendo a interface.
 */
type Bucket = { hits: number[] };
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const store: Map<string, Bucket> = (g.__rl ??= new Map<string, Bucket>());

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = store.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    store.set(key, b);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - b.hits[0])) / 1000) };
  }
  b.hits.push(now);
  store.set(key, b);
  if (store.size > 50_000) for (const k of store.keys()) { store.delete(k); if (store.size < 40_000) break; }
  return { ok: true, retryAfter: 0 };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export async function limitByIp(scope: string, limit: number, windowMs: number) {
  return rateLimit(`${scope}:${await clientIp()}`, limit, windowMs);
}

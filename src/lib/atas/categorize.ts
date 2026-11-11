import { f } from "./text";

export interface CategoryRef { id: string; slug: string; keywords: string[] }

/** Classificação sugerida por palavras-chave (sempre marcada como automática). */
export function suggestCategory(texts: string[], categories: CategoryRef[]): string | null {
  const hay = " " + f(texts.join(" ")) + " ";
  let best: { id: string; score: number } | null = null;
  for (const c of categories) {
    let score = 0;
    for (const k of c.keywords) {
      const kw = f(k);
      if (!kw) continue;
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
      const m = hay.match(re);
      if (m) score += m.length * (kw.includes(" ") ? 2 : 1);
    }
    if (c.slug === "servicos") score *= 0.4; // categoria genérica: só vence quando nada mais específico casar
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? categories.find((c) => c.slug === "outros")?.id ?? null;
}

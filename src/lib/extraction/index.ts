import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { env } from "../env";
import { isValidCnpj, onlyDigits } from "../validators";
import { heuristicExtract } from "./heuristic";
import { llmExtract } from "./llm";
import type { ExtractedAta } from "./schema";

export interface ExtractionOutcome {
  method: "llm" | "heuristica";
  model: string | null;
  textChars: number;
  data: ExtractedAta;
  warnings: string[];
}

export async function pdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return { text: (text as string[]).join("\n"), pages: totalPages };
}

/**
 * Pipeline: (1) extrai camada de texto do PDF; (2) se houver LLM configurado, extração estruturada
 * (PDF digitalizado → envio do PDF para leitura visual/OCR); (3) senão, heurística por regex.
 * Validações finais marcam inconsistências como avisos. Nada é considerado verificado.
 */
export async function extractAta(buf: Buffer): Promise<ExtractionOutcome> {
  const warnings: string[] = [];
  let text = "";
  try { text = (await pdfText(buf)).text; } catch { warnings.push("Não foi possível ler a camada de texto do PDF."); }
  const scanned = text.replace(/\s/g, "").length < 300;
  if (scanned) warnings.push("O PDF parece digitalizado (pouco texto selecionável).");

  let outcome: ExtractionOutcome | null = null;
  if (env.anthropicKey) {
    try {
      const r = scanned ? await llmExtract({ pdf: buf }) : await llmExtract({ text: text.slice(0, 400_000) });
      outcome = { method: "llm", model: r.model, textChars: text.length, data: r.data, warnings };
    } catch (e) {
      warnings.push(`Extração por IA indisponível (${(e as Error).message}); aplicada extração básica.`);
    }
  } else if (scanned) {
    warnings.push("OCR requer a integração de IA (ANTHROPIC_API_KEY). Preencha os dados manualmente.");
  }
  if (!outcome) outcome = { method: "heuristica", model: null, textChars: text.length, data: heuristicExtract(text), warnings };

  const d = outcome.data;
  for (const k of ["supplier_cnpj", "managing_entity_cnpj"] as const) {
    if (d[k]) { d[k] = onlyDigits(d[k]!); if (!isValidCnpj(d[k]!)) { warnings.push(`CNPJ extraído inválido (${d[k]}) — conferir.`); d[k] = null; } }
  }
  for (const k of ["signature_date", "validity_start", "validity_end"] as const)
    if (d[k] && !/^\d{4}-\d{2}-\d{2}$/.test(d[k]!)) { warnings.push(`Data em formato inesperado em ${k}.`); d[k] = null; }
  if (d.validity_start && d.validity_end && d.validity_end < d.validity_start) warnings.push("Fim da vigência anterior ao início — conferir.");
  for (const it of d.items) {
    if (it.quantity != null && it.unit_price != null && it.total_price != null) {
      const calc = it.quantity * it.unit_price;
      if (Math.abs(calc - it.total_price) > Math.max(0.05, it.total_price * 0.01))
        warnings.push(`Item ${it.item_number ?? "?"}: total (${it.total_price}) diverge de quantidade × preço (${calc.toFixed(2)}).`);
    }
  }
  outcome.warnings = [...warnings, ...d.warnings];
  return outcome;
}

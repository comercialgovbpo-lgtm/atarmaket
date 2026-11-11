import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "../env";
import { extractedAtaSchema, type ExtractedAta } from "./schema";

const SYSTEM = `Você extrai dados estruturados de Atas de Registro de Preços (ARP) de órgãos públicos brasileiros.
Regras:
- Transcreva apenas o que está no documento. Nunca invente valores; use null quando o dado não aparecer ou estiver ilegível.
- Datas no formato AAAA-MM-DD. Valores numéricos sem separador de milhar (ponto como decimal).
- CNPJ apenas com dígitos. Distinga o CNPJ do órgão gerenciador do CNPJ do fornecedor (detentor/beneficiário da ata).
- Liste todos os itens registrados com número, descrição, unidade, quantidade, preço unitário e total. Informe CATMAT/CATSER somente se o código aparecer.
- Registre em "warnings" qualquer ambiguidade, divergência de valores, páginas ilegíveis ou vigência calculada por você.`;

export interface LlmExtractionResult { data: ExtractedAta; model: string }

/**
 * Extração com Claude. Para PDFs digitalizados (sem camada de texto) o PDF é enviado como documento,
 * o que permite leitura por visão (OCR). O resultado SEMPRE passa por revisão humana antes de publicar.
 */
export async function llmExtract(input: { text?: string; pdf?: Buffer }): Promise<LlmExtractionResult> {
  if (!env.anthropicKey) throw new Error("ANTHROPIC_API_KEY não configurada");
  const client = new Anthropic({ apiKey: env.anthropicKey, timeout: 180_000 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdf.toString("base64") } });
    content.push({ type: "text", text: "Extraia os dados da ata de registro de preços acima." });
  } else {
    content.push({ type: "text", text: `<documento>\n${input.text}\n</documento>\n\nExtraia os dados da ata de registro de preços acima.` });
  }
  const response = await client.beta.messages.parse({
    model: env.extractionModel,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(extractedAtaSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("O modelo recusou processar o documento");
  if (response.stop_reason === "max_tokens") throw new Error("Documento extenso demais para extração automática em uma etapa");
  if (!response.parsed_output) throw new Error("Resposta sem estrutura válida");
  return { data: response.parsed_output, model: response.model };
}

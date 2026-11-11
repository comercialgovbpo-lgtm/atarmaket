import { z } from "zod";

/** Estrutura extraída de uma ata. Todos os campos são anuláveis: o que não estiver no documento fica null. */
export const extractedItemSchema = z.object({
  item_number: z.number().int().nullable(),
  catalog_type: z.enum(["CATMAT", "CATSER"]).nullable(),
  catalog_code: z.string().nullable(),
  description: z.string(),
  unit: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  total_price: z.number().nullable(),
});

export const extractedAtaSchema = z.object({
  ata_number: z.string().nullable(),
  procurement_reference: z.string().nullable().describe("Pregão ou procedimento de origem, ex.: 'Pregão Eletrônico nº 12/2025'"),
  process_number: z.string().nullable(),
  managing_entity_name: z.string().nullable(),
  managing_entity_cnpj: z.string().nullable(),
  uasg: z.string().nullable(),
  supplier_name: z.string().nullable(),
  supplier_cnpj: z.string().nullable(),
  object: z.string().nullable(),
  signature_date: z.string().nullable().describe("AAAA-MM-DD"),
  validity_start: z.string().nullable().describe("AAAA-MM-DD"),
  validity_end: z.string().nullable().describe("AAAA-MM-DD; calcule a partir do prazo se o documento informar apenas a duração e a data de início"),
  items: z.array(extractedItemSchema),
  warnings: z.array(z.string()).describe("Ambiguidades, campos ilegíveis ou dados que exigem conferência humana"),
});

export type ExtractedAta = z.infer<typeof extractedAtaSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

export const emptyExtraction = (): ExtractedAta => ({
  ata_number: null, procurement_reference: null, process_number: null, managing_entity_name: null, managing_entity_cnpj: null,
  uasg: null, supplier_name: null, supplier_cnpj: null, object: null, signature_date: null, validity_start: null, validity_end: null,
  items: [], warnings: [],
});

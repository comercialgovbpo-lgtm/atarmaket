import { isValidCnpj, onlyDigits, parseBrNumber } from "../validators";
import { emptyExtraction, type ExtractedAta } from "./schema";

const NUM = String.raw`(?:n[º°o.]*\s*|número\s*)?`;

const brDate = (s: string | undefined | null): string | null => {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s ?? "");
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};

const MONTHS: Record<string, string> = { janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
const longDate = (s: string): string | null => {
  const m = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i.exec(s);
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
};

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Extração por expressões regulares — usada quando não há LLM configurado ou como pré-preenchimento.
 * Cobre identificação básica; itens normalmente exigem preenchimento manual.
 */
export function heuristicExtract(text: string): ExtractedAta {
  const out = emptyExtraction();
  const t = text.replace(/ /g, " ");
  const flat = t.replace(/\s+/g, " ");

  out.ata_number = /ata\s+de\s+registro\s+de\s+pre[çc]os?\s*[:\-–]?\s*N[º°o.]*\s*([\w./-]{1,30})/i.exec(flat)?.[1] ?? /\bARP\s*N[º°o.]*\s*([\w./-]{1,30})/i.exec(flat)?.[1] ?? null;
  const preg = new RegExp(String.raw`(preg[ãa]o\s+(?:eletr[ôo]nico|presencial)?\s*${NUM}[\w./-]{1,25})`, "i").exec(flat);
  out.procurement_reference = preg?.[1]?.trim() ?? null;
  out.process_number = new RegExp(String.raw`processo\s+(?:administrativo|licitat[óo]rio)?\s*${NUM}([\d./-]{4,40})`, "i").exec(flat)?.[1] ?? null;
  out.uasg = /UASG\s*[:\-–]?\s*(\d{5,6})/i.exec(flat)?.[1] ?? null;

  // CNPJs: classifica por contexto próximo
  const cnpjRe = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  const found: { cnpj: string; ctx: string }[] = [];
  for (const m of flat.matchAll(cnpjRe)) {
    const c = onlyDigits(m[0]);
    if (!isValidCnpj(c) || found.some((f) => f.cnpj === c)) continue;
    found.push({ cnpj: c, ctx: flat.slice(Math.max(0, (m.index ?? 0) - 220), (m.index ?? 0)).toLowerCase() });
  }
  const supplierHint = /(fornecedor|detentora|empresa|contratada|benefici[áa]ri|vencedora|raz[ãa]o social)/;
  const orgHint = /(munic[íi]pio|prefeitura|secretaria|[óo]rg[ãa]o|universidade|instituto|tribunal|c[âa]mara|minist[ée]rio|estado d|governo|fundo|autarquia|gerenciador)/;
  const sup = found.find((f) => supplierHint.test(f.ctx.slice(-120)));
  const org = found.find((f) => f !== sup && orgHint.test(f.ctx.slice(-160))) ?? found.find((f) => f !== sup);
  out.supplier_cnpj = sup?.cnpj ?? (found.length > 1 ? found[1].cnpj : null);
  out.managing_entity_cnpj = org?.cnpj ?? null;
  if (found.length > 1 && !sup) out.warnings.push("Mais de um CNPJ encontrado: confira qual pertence ao fornecedor e qual ao órgão gerenciador.");

  const nameBefore = (cnpj: string | null) => {
    if (!cnpj) return null;
    const idx = flat.search(new RegExp(cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1\\.?$2\\.?$3\\/?$4-?$5")));
    if (idx < 0) return null;
    const before = flat.slice(Math.max(0, idx - 200), idx);
    const re = /([A-ZÀ-Ü][A-ZÀ-Ü0-9 .&'\/-]{3,140}?)\s*,?\s*(?:inscrit[ao]|pessoa jur[íi]dica|CNPJ|sob o)/g;
    let last: string | null = null;
    for (const m of before.matchAll(re)) if (!/^(?:NO\s+)?CNPJ$|^SOB O$/i.test(m[1].trim())) last = m[1];
    if (!last) return null;
    let name = last.trim();
    const cut = name.replace(/^.*\d[\d.\/-]*\s+/, "");
    if (cut.length >= 5) name = cut;
    name = name.replace(/^((O|A|OS|AS|E|N[º°O]?)\s+)+/, "").trim();
    return name.length >= 3 ? name : null;
  };
  out.supplier_name = nameBefore(out.supplier_cnpj);
  out.managing_entity_name = nameBefore(out.managing_entity_cnpj);

  const obj = /objeto\s*[:\-–]\s*(.{20,600}?)(?:\.\s|\s\d+\.\s|cl[áa]usula|$)/i.exec(flat) ??
    /(registro de pre[çc]os para (?:a |o )?(?:eventual |futura )?.{20,400}?)(?:\.\s|$)/i.exec(flat);
  out.object = obj?.[1]?.trim() ?? null;

  const sign = /(?:assinad[ao]|firmad[ao]|lavrad[ao])[^.]{0,80}?(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(flat);
  out.signature_date = brDate(sign?.[1]) ?? longDate(flat.slice(-1500)) ?? null;

  const vig = /vig[êe]ncia[^.]{0,160}?(\d{1,2}\/\d{1,2}\/\d{4})[^.]{0,40}?(?:a|at[ée])\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(flat);
  if (vig) { out.validity_start = brDate(vig[1]); out.validity_end = brDate(vig[2]); }
  else {
    const dur = /(?:vig[êe]ncia|validade)[^.]{0,120}?(\d{1,2})\s*\(?[a-zç ]*\)?\s*meses/i.exec(flat);
    if (dur) {
      const start = out.signature_date;
      if (start) {
        out.validity_start = start;
        out.validity_end = addMonths(start, Number(dur[1]));
        out.warnings.push(`Vigência calculada a partir de ${dur[1]} meses contados da assinatura — confirme o termo inicial no documento.`);
      } else out.warnings.push(`Documento indica vigência de ${dur[1]} meses, mas a data inicial não foi identificada.`);
    }
  }

  // Itens: linhas com padrão "nº | descrição | unidade | quantidade | valor unitário | valor total"
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const money = String.raw`(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2,4}`;
  const itemRe = new RegExp(String.raw`^(\d{1,4})\s+(.{8,240}?)\s+([A-Za-zÀ-ú]{1,12}\.?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s+(${money})\s+(${money})$`);
  for (const l of lines) {
    const m = itemRe.exec(l);
    if (!m) continue;
    const catm = /(CATMAT|CATSER)\s*[:\-]?\s*(\d{3,9})/i.exec(m[2]);
    out.items.push({
      item_number: Number(m[1]), description: m[2].trim(), unit: m[3], quantity: parseBrNumber(m[4]),
      unit_price: parseBrNumber(m[5]), total_price: parseBrNumber(m[6]),
      catalog_type: catm ? (catm[1].toUpperCase() as "CATMAT" | "CATSER") : null, catalog_code: catm?.[2] ?? null,
    });
  }
  if (!out.items.length) out.warnings.push("Itens não identificados automaticamente: cadastre-os manualmente a partir do documento.");
  return out;
}

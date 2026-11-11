export const brl = (v: number | string | null | undefined, digits = 2) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) });

export const num = (v: number | string | null | undefined) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export function dateBR(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T12:00:00" : v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
export function dateTimeBR(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export function formatCnpj(c: string | null | undefined): string {
  const d = (c ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`; // CPF mascarado (LGPD)
  return c ?? "—";
}

export function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? new Date(d + (d.length === 10 ? "T23:59:59-03:00" : "")) : d;
  return Math.ceil((t.getTime() - Date.now()) / 86_400_000);
}

export function toDateInput(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, sp, ch) => sp + ch.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

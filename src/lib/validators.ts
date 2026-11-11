import { z } from "zod";

export const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

export function isValidCnpj(input: string): boolean {
  const c = onlyDigits(input);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, wi, i) => acc + Number(c[i]) * wi, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export const cnpjSchema = z.string().transform(onlyDigits).refine(isValidCnpj, "CNPJ inválido");

export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;
export const ufSchema = z.enum(UFS);

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letras e números");

export const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(200);

/** Texto livre: remove caracteres de controle; o React já escapa saída (proteção XSS). */
export const text = (max = 2000) =>
  z.string().trim().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));
export const optText = (max = 2000) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), text(max).optional());

export const uuidSchema = z.string().uuid();

/** Converte "1.234,56" ou "1234.56" em número. */
export function parseBrNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formDataToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

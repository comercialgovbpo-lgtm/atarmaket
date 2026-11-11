/** Normaliza texto: minúsculas, sem acentos, espaços simples. */
export const f = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

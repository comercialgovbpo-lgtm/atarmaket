export type AtaStatus =
  | "rascunho" | "importada" | "cadastrada" | "em_validacao" | "verificada" | "fornecedor_confirmado"
  | "vigencia_confirmada" | "disponibilidade_consultada" | "encerrada" | "rejeitada";

export const STATUS_INFO: Record<AtaStatus, { label: string; tone: "gray" | "blue" | "amber" | "green" | "red" | "navy"; help: string; public: boolean }> = {
  rascunho: { label: "Rascunho", tone: "gray", help: "Em elaboração pelo fornecedor; não publicada.", public: false },
  importada: { label: "Importada", tone: "blue", help: "Localizada em fonte pública oficial. Dados replicados da fonte, sem conferência documental pela plataforma.", public: true },
  cadastrada: { label: "Cadastrada pelo fornecedor", tone: "navy", help: "Enviada pelo próprio fornecedor e aprovada na moderação inicial. Conferência documental ainda não concluída.", public: true },
  em_validacao: { label: "Em validação", tone: "amber", help: "Aguardando conferência pela equipe da plataforma.", public: false },
  verificada: { label: "Verificada", tone: "green", help: "Dados documentais conferidos com o documento original.", public: true },
  fornecedor_confirmado: { label: "Fornecedor confirmado", tone: "green", help: "Vínculo entre a ata e o fornecedor comprovado documentalmente.", public: true },
  vigencia_confirmada: { label: "Vigência confirmada", tone: "green", help: "Prazo de vigência conferido (incluindo eventuais prorrogações).", public: true },
  disponibilidade_consultada: { label: "Disponibilidade consultada", tone: "green", help: "O fornecedor foi consultado sobre disponibilidade comercial. Não equivale a saldo confirmado pelo órgão gerenciador.", public: true },
  encerrada: { label: "Encerrada", tone: "red", help: "Ata vencida, cancelada ou indisponível.", public: true },
  rejeitada: { label: "Rejeitada", tone: "red", help: "Não aprovada na moderação.", public: false },
};

export const PUBLIC_STATUSES = (Object.keys(STATUS_INFO) as AtaStatus[]).filter((s) => STATUS_INFO[s].public);
export const MODERATION_TARGETS: AtaStatus[] = ["cadastrada", "verificada", "fornecedor_confirmado", "vigencia_confirmada", "disponibilidade_consultada", "encerrada", "rejeitada", "em_validacao"];

export function validityState(validityEnd: string | null, cancelled: boolean, status: string): { label: string; tone: "green" | "amber" | "red" | "gray" } {
  if (cancelled) return { label: "Cancelada na fonte", tone: "red" };
  if (status === "encerrada") return { label: "Encerrada", tone: "red" };
  if (!validityEnd) return { label: "Vigência não informada", tone: "gray" };
  const end = new Date(validityEnd + "T23:59:59-03:00").getTime();
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  if (days < 0) return { label: "Vigência expirada", tone: "red" };
  if (days <= 60) return { label: `Vigente — vence em ${days} dia${days === 1 ? "" : "s"}`, tone: "amber" };
  return { label: "Vigente (pela data informada)", tone: "green" };
}

export const OPPORTUNITY_STATUS: Record<string, string> = {
  novo_interessado: "Novo interessado",
  contato_iniciado: "Contato iniciado",
  em_negociacao: "Em negociação",
  aguardando_documentacao: "Aguardando documentação",
  adesao_em_analise: "Adesão em análise",
  convertido: "Convertido",
  perdido: "Perdido",
};

export const CONTACT_STATUS: Record<string, string> = {
  enviada: "Enviada",
  aguardando_fornecedor: "Aguardando o fornecedor criar conta",
  visualizada: "Visualizada pelo fornecedor",
  respondida: "Respondida",
  encerrada: "Encerrada",
};

export const SPHERE_LABEL: Record<string, string> = { federal: "Federal", estadual: "Estadual", distrital: "Distrital", municipal: "Municipal" };

/** "045/2026" + 2026 → "045/2026" (não repete o ano já presente no número). */
export const ataLabel = (n: string, year: number | null | undefined) => (year && !n.includes(String(year)) ? `${n}/${year}` : n);

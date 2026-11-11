/**
 * Apoio à conferência de adesão (Lei 14.133/2021, art. 86, com alterações da Lei 14.770/2023).
 * Ferramenta de apoio: NÃO substitui a instrução processual nem a análise jurídica do órgão.
 */
export type CheckLevel = "ok" | "info" | "atencao" | "impeditivo";
export interface ComplianceCheck { id: string; title: string; level: CheckLevel; detail: string; reference?: string }

export interface ComplianceInput {
  validityEnd: string | null;
  cancelled: boolean;
  status: string;
  validityConfirmed: boolean;
  sourceReportedAdhesion: boolean | null;
  managingSphere: string | null;
  requesterSphere?: string | null;
  itemQuantity?: number | null;
  intendedQuantity?: number | null;
}

export const LEGAL_NOTICE =
  "A disponibilização desta ata na plataforma não representa autorização automática para adesão. A possibilidade de utilização deverá ser analisada pelo órgão interessado, conforme a legislação aplicável, a regulamentação pertinente e as condições específicas da ata.";

export function evaluateAdhesion(i: ComplianceInput): ComplianceCheck[] {
  const out: ComplianceCheck[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (i.cancelled) out.push({ id: "cancelada", title: "Ata cancelada na fonte", level: "impeditivo", detail: "A fonte oficial registra cancelamento desta ata." });
  if (!i.validityEnd) {
    out.push({ id: "vigencia", title: "Vigência não informada", level: "atencao", detail: "Confirme o prazo de vigência no documento original e no órgão gerenciador.", reference: "Art. 84" });
  } else if (i.validityEnd < today || i.status === "encerrada") {
    out.push({ id: "vigencia", title: "Vigência expirada", level: "impeditivo", detail: `A data final informada (${i.validityEnd.split("-").reverse().join("/")}) já passou. Verifique eventual prorrogação formalizada.`, reference: "Art. 84" });
  } else {
    out.push({
      id: "vigencia", title: i.validityConfirmed ? "Vigência conferida" : "Vigente pela data informada",
      level: i.validityConfirmed ? "ok" : "info",
      detail: i.validityConfirmed ? "Prazo conferido pela plataforma; confirme novamente na data da adesão." : "Data obtida da fonte/fornecedor, ainda não conferida documentalmente.",
      reference: "Art. 84",
    });
  }

  if (i.sourceReportedAdhesion === false)
    out.push({ id: "previsao", title: "Fonte indica que a ata não admite adesão", level: "atencao", detail: "O campo de possibilidade de adesão informado à fonte oficial está como “não”. Verifique o edital e a ata: a adesão por não participantes depende de previsão no instrumento.", reference: "Art. 86, §2º" });
  else if (i.sourceReportedAdhesion === true)
    out.push({ id: "previsao", title: "Fonte informa possibilidade de adesão", level: "info", detail: "Informação declarada pelo órgão na fonte oficial. Não equivale a autorização: depende de consulta e aceite do gerenciador e do fornecedor.", reference: "Art. 86, §2º" });
  else
    out.push({ id: "previsao", title: "Previsão de adesão não informada", level: "atencao", detail: "Confirme no edital e na ata se há previsão de adesão por órgãos não participantes.", reference: "Art. 86, §2º" });

  if (i.requesterSphere === "federal" && i.managingSphere && i.managingSphere !== "federal")
    out.push({ id: "esfera", title: "Vedação para órgãos federais", level: "impeditivo", detail: "É vedada aos órgãos e entidades da Administração Pública federal a adesão a ata gerenciada por órgão ou entidade estadual, distrital ou municipal.", reference: "Art. 86, §8º" });
  else if (!i.requesterSphere && i.managingSphere && i.managingSphere !== "federal")
    out.push({ id: "esfera", title: "Atenção à esfera do órgão interessado", level: "info", detail: "Órgãos federais não podem aderir a atas de gerenciadores estaduais, distritais ou municipais.", reference: "Art. 86, §8º" });

  if (i.managingSphere === "municipal")
    out.push({ id: "municipal", title: "Gerenciador municipal — análise adicional", level: "atencao", detail: "A possibilidade de adesão a atas de gerenciadores municipais foi tratada pela Lei 14.770/2023 ao alterar o art. 86, §3º. Confira a redação vigente, os requisitos aplicáveis e o regulamento do ente.", reference: "Art. 86, §3º (Lei 14.770/2023)" });
  if (!i.managingSphere)
    out.push({ id: "esfera_desconhecida", title: "Esfera do gerenciador não identificada", level: "atencao", detail: "Confirme a esfera administrativa do órgão gerenciador." });

  if (i.itemQuantity && i.intendedQuantity) {
    const pct = (i.intendedQuantity / i.itemQuantity) * 100;
    out.push(pct > 50
      ? { id: "limite_individual", title: "Quantidade acima do limite individual", level: "impeditivo", detail: `A quantidade pretendida corresponde a ${pct.toFixed(1)}% do quantitativo registrado. O limite por órgão não participante é de 50% dos quantitativos dos itens.`, reference: "Art. 86, §4º" }
      : { id: "limite_individual", title: "Quantidade dentro do limite individual (50%)", level: "ok", detail: `A quantidade pretendida corresponde a ${pct.toFixed(1)}% do quantitativo registrado.`, reference: "Art. 86, §4º" });
  } else {
    out.push({ id: "limite_individual", title: "Limite individual de 50%", level: "info", detail: "Cada órgão não participante pode contratar até 50% dos quantitativos dos itens registrados para gerenciador e participantes.", reference: "Art. 86, §4º" });
  }
  out.push({ id: "limite_global", title: "Limite global de adesões (dobro do quantitativo)", level: "atencao", detail: "As adesões, somadas, não podem exceder o dobro do quantitativo de cada item. As quantidades já utilizadas por outros órgãos não são conhecidas pela plataforma — confirme o saldo com o órgão gerenciador.", reference: "Art. 86, §5º" });
  out.push({ id: "saldo", title: "Saldo não confirmado", level: "atencao", detail: "A plataforma não confirma saldo disponível. Quantidades exibidas são as registradas na ata, não o saldo remanescente." });
  return out;
}

/** Itens que o órgão deve instruir no processo (checklist documental). */
export const ADHESION_CHECKLIST: { id: string; label: string; reference: string }[] = [
  { id: "justificativa", label: "Justificativa da vantagem da adesão (inclusive em caso de provável desabastecimento ou descontinuidade)", reference: "Art. 86, §2º, I" },
  { id: "precos", label: "Demonstração de que os valores registrados são compatíveis com os praticados no mercado (pesquisa de preços)", reference: "Art. 86, §2º, II c/c art. 23" },
  { id: "aceite_gerenciador", label: "Consulta prévia e aceitação do órgão ou entidade gerenciadora", reference: "Art. 86, §2º, III" },
  { id: "aceite_fornecedor", label: "Consulta prévia e aceitação do fornecedor beneficiário", reference: "Art. 86, §2º, III" },
  { id: "vigencia", label: "Confirmação da vigência da ata na data da contratação", reference: "Art. 84" },
  { id: "quantitativo", label: "Quantidade pretendida ≤ 50% do quantitativo registrado por item", reference: "Art. 86, §4º" },
  { id: "saldo_global", label: "Confirmação, com o gerenciador, de que o total de adesões não ultrapassa o dobro do quantitativo", reference: "Art. 86, §5º" },
  { id: "esfera", label: "Compatibilidade entre as esferas do órgão interessado e do gerenciador", reference: "Art. 86, §§3º e 8º" },
  { id: "regulamento", label: "Observância do regulamento do ente e das regras específicas do edital e da ata", reference: "Art. 78, §1º e regulamentos" },
  { id: "prazo_contratacao", label: "Efetivação da contratação no prazo fixado após a autorização do gerenciador", reference: "Regulamento aplicável" },
];

export const CHECK_LEVEL_LABEL: Record<CheckLevel, string> = { ok: "Conforme", info: "Informativo", atencao: "Requer análise", impeditivo: "Possível impedimento" };

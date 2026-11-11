/**
 * Cliente da API pública do PNCP.
 * Documentação: https://pncp.gov.br/api/consulta/swagger-ui/index.html
 *
 * Endpoints utilizados (verificados em 11/2026):
 *  - GET /api/consulta/v1/atas/atualizacao?dataInicial&dataFinal&pagina&tamanhoPagina  (atas por data de atualização)
 *  - GET /api/consulta/v1/atas?dataInicial&dataFinal&pagina&tamanhoPagina            (atas por período de vigência)
 *  - GET /api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}                    (contratação de origem)
 *  - GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/atas                          (atas da contratação)
 *  - GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens?pagina&tamanhoPagina    (itens)
 *  - GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens/{n}/resultados          (resultado/fornecedor/preço)
 *  - GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/atas/{seqAta}/arquivos         (documentos da ata)
 *  - GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos                       (edital e anexos)
 * A API de consulta não informa o vínculo item ↔ ata quando há várias atas na mesma contratação.
 */

const BASE = process.env.PNCP_BASE_URL ?? "https://pncp.gov.br";
const UA = "AtaMarket-sync/1.0 (+marketplace de atas; consulta a dados abertos)";

export interface PncpAtaListItem {
  numeroControlePNCPAta: string;
  numeroAtaRegistroPreco: string;
  anoAta: number;
  numeroControlePNCPCompra: string;
  cancelado: boolean;
  dataCancelamento: string | null;
  dataAssinatura: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  dataPublicacaoPncp: string | null;
  dataAtualizacao: string | null;
  dataAtualizacaoGlobal: string | null;
  objetoContratacao: string | null;
  cnpjOrgao: string;
  nomeOrgao: string;
  codigoUnidadeOrgao: string | null;
  nomeUnidadeOrgao: string | null;
  cnpjOrgaoSubrogado: string | null;
  nomeOrgaoSubrogado: string | null;
  possibilidadeAdesao: boolean | null;
}
export interface PncpPage<T> { data: T[]; totalRegistros: number; totalPaginas: number; numeroPagina: number; paginasRestantes: number; empty: boolean }

export interface PncpCompra {
  numeroControlePNCP: string; anoCompra: number; sequencialCompra: number; numeroCompra: string | null; processo: string | null;
  orgaoEntidade: { cnpj: string; razaoSocial: string; poderId: string | null; esferaId: string | null };
  unidadeOrgao: { ufSigla: string | null; municipioNome: string | null; codigoUnidade: string | null; nomeUnidade: string | null; codigoIbge: string | null } | null;
  modalidadeNome: string | null; objetoCompra: string | null; srp: boolean | null; dataAtualizacaoGlobal: string | null; linkSistemaOrigem: string | null;
}
export interface PncpItem {
  numeroItem: number; descricao: string; materialOuServico: "M" | "S" | null; quantidade: number | null; unidadeMedida: string | null;
  valorUnitarioEstimado: number | null; temResultado: boolean; catalogo: string | null; catalogoCodigoItem: string | null;
  informacaoComplementar: string | null; situacaoCompraItemNome: string | null;
}
export interface PncpResultado {
  niFornecedor: string; tipoPessoa: "PJ" | "PF" | "PE" | null; nomeRazaoSocialFornecedor: string; numeroItem: number;
  quantidadeHomologada: number | null; valorUnitarioHomologado: number | null; valorTotalHomologado: number | null;
  sequencialResultado: number; dataCancelamento: string | null; porteFornecedorNome: string | null; situacaoCompraItemResultadoNome: string | null;
}
export interface PncpArquivo { url?: string; uri?: string; titulo: string; tipoDocumentoNome: string; tipoDocumentoId: number; dataPublicacaoPncp: string; sequencialDocumento: number; statusAtivo?: boolean }
export interface PncpAtaCompra { numeroAtaRegistroPreco: string; sequencialAta: number; numeroControlePNCP: string; cancelado: boolean }

export class PncpError extends Error {
  constructor(message: string, public status: number, public url: string) { super(message); }
}

export class PncpClient {
  /** Próximo horário livre: cada requisição reserva um "slot", o que mantém a taxa mesmo com chamadas em paralelo. */
  private nextSlot = 0;
  private async throttle() {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    if (slot > now) await sleep(slot - now);
  }
  constructor(private intervalMs = 400, private timeoutMs = 30_000) {}

  private async get<T>(path: string, allowEmpty = false): Promise<T | null> {
    const url = `${BASE}${path}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.throttle();
      try {
        const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(this.timeoutMs), cache: "no-store" });
        if (res.status === 204 || (allowEmpty && res.status === 404)) return null;
        if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
        if (!res.ok) throw new PncpError(`PNCP ${res.status}`, res.status, url);
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text) as T;
      } catch (e) {
        if (e instanceof PncpError) throw e;
        if (attempt === 3) throw new PncpError(`Falha de rede: ${(e as Error).message}`, 0, url);
        await sleep(1000 * 2 ** attempt);
      }
    }
    throw new PncpError("PNCP indisponível após novas tentativas", 503, url);
  }

  atasByUpdate(dataInicial: string, dataFinal: string, pagina: number, tamanhoPagina = 50) {
    return this.get<PncpPage<PncpAtaListItem>>(`/api/consulta/v1/atas/atualizacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`, true);
  }
  atasByValidity(dataInicial: string, dataFinal: string, pagina: number, tamanhoPagina = 50, cnpj?: string) {
    return this.get<PncpPage<PncpAtaListItem>>(`/api/consulta/v1/atas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&tamanhoPagina=${tamanhoPagina}${cnpj ? `&cnpj=${cnpj}` : ""}`, true);
  }
  compra(cnpj: string, ano: number, seq: number) {
    return this.get<PncpCompra>(`/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`, true);
  }
  atasDaCompra(cnpj: string, ano: number, seq: number) {
    return this.get<{ data: PncpAtaCompra[] }>(`/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/atas`, true);
  }
  itens(cnpj: string, ano: number, seq: number, pagina: number, tamanho = 100) {
    return this.get<PncpItem[]>(`/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=${pagina}&tamanhoPagina=${tamanho}`, true);
  }
  resultados(cnpj: string, ano: number, seq: number, item: number) {
    return this.get<PncpResultado[]>(`/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${item}/resultados`, true);
  }
  arquivosAta(cnpj: string, ano: number, seq: number, seqAta: number) {
    return this.get<PncpArquivo[]>(`/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/atas/${seqAta}/arquivos`, true);
  }
  arquivosCompra(cnpj: string, ano: number, seq: number) {
    return this.get<PncpArquivo[]>(`/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`, true);
  }
}

/** "18457226000181-1-000015/2023-000001" → partes. */
export function parseControlNumber(ctrl: string) {
  const m = /^(\d{14})-(\d+)-(\d+)\/(\d{4})(?:-(\d+))?$/.exec(ctrl.trim());
  if (!m) return null;
  return { cnpj: m[1], seq: Number(m[3]), ano: Number(m[4]), seqAta: m[5] ? Number(m[5]) : null };
}

export const pncpPublicUrl = {
  ata: (cnpj: string, ano: number, seq: number, seqAta: number) => `https://pncp.gov.br/app/atas/${cnpj}/${ano}/${seq}/${seqAta}`,
  compra: (cnpj: string, ano: number, seq: number) => `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`,
};

export const SPHERE_FROM_PNCP: Record<string, string> = { F: "federal", E: "estadual", M: "municipal", D: "distrital" };
export const POWER_FROM_PNCP: Record<string, string> = { E: "executivo", L: "legislativo", J: "judiciario", N: "outro" };

/** Executa tarefas com concorrência limitada, preservando a ordem dos resultados. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Corrige datas inválidas vindas da fonte (ex.: ano 7203). Retorna null quando implausível. */
export function plausibleDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const y = Number(d.slice(0, 4));
  return y >= 2000 && y <= 2100 ? d : null;
}

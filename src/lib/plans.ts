import "server-only";
import type { Tx } from "./db";

export interface Entitlements {
  planCode: string | null;
  planName: string | null;
  status: string | null;
  periodEnd: string | null;
  ataLimit: number;
  userLimit: number;
  features: Record<string, boolean | number>;
  subscriptionId: string | null;
}

/** Recursos liberados para a organização com base na assinatura vigente. */
export async function getEntitlements(tx: Tx, orgId: string): Promise<Entitlements> {
  const s = await tx.one<{ id: string; status: string; current_period_end: Date | null; code: string; name: string; ata_limit: number | null; user_limit: number | null; features: Record<string, boolean | number> }>(
    `SELECT s.id, s.status, s.current_period_end, p.code, p.name, p.ata_limit, p.user_limit, p.features
       FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.organization_id = $1 AND s.status = 'ativa'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
      ORDER BY p.price_cents DESC LIMIT 1`, [orgId]);
  if (!s) return { planCode: null, planName: null, status: null, periodEnd: null, ataLimit: 0, userLimit: 1, features: {}, subscriptionId: null };
  return {
    planCode: s.code, planName: s.name, status: s.status,
    periodEnd: s.current_period_end ? s.current_period_end.toISOString() : null,
    ataLimit: s.ata_limit ?? 100000, userLimit: s.user_limit ?? 1, features: s.features ?? {}, subscriptionId: s.id,
  };
}

export const has = (e: Entitlements, f: string) => Boolean(e.features[f]);

export const FEATURE_LABELS: Record<string, string> = {
  marketplace_exposure: "Exposição no marketplace", receive_contacts: "Recebimento de contatos", company_profile: "Perfil empresarial",
  full_profile: "Perfil completo", opportunities_panel: "Painel de oportunidades", view_stats: "Estatísticas de visualização",
  crm: "Gestão de contatos (CRM)", expiry_alerts: "Alertas de vencimento", multi_users: "Múltiplos usuários",
  portfolio: "Gestão de carteira", advanced_reports: "Relatórios avançados", featured_eligible: "Elegível a destaque",
  favorites: "Favoritos", contact_requests: "Solicitações a fornecedores", advanced_search: "Pesquisa avançada",
  compare: "Comparador de atas", saved_searches: "Pesquisas salvas", alerts: "Alertas", search_history: "Histórico de pesquisas",
  reports: "Relatórios", opportunity_management: "Gestão de oportunidades", multi_units: "Múltiplas unidades",
};

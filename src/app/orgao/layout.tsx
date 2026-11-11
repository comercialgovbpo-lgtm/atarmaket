import { PanelShell } from "@/components/site";
import { requireOrg } from "@/lib/auth/session";

export default async function GovLayout({ children }: { children: React.ReactNode }) {
  const { org } = await requireOrg("government", "/orgao");
  return (
    <PanelShell title="Painel do órgão" orgName={org.legal_name} nav={[
      { href: "/orgao", label: "Visão geral" },
      { href: "/atas", label: "Pesquisar atas" },
      { href: "/orgao/favoritos", label: "Favoritos e oportunidades" },
      { href: "/orgao/comparar", label: "Comparador" },
      { href: "/orgao/pesquisas", label: "Pesquisas salvas" },
      { href: "/orgao/alertas", label: "Alertas" },
      { href: "/orgao/relatorios", label: "Relatórios de preços" },
      { href: "/orgao/solicitacoes", label: "Solicitações enviadas" },
      { href: "/orgao/equipe", label: "Equipe" },
      { href: "/orgao/licenca", label: "Licença" },
      { href: "/conta", label: "Minha conta" },
    ]}>{children}</PanelShell>
  );
}

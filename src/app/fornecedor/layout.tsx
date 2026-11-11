import { PanelShell } from "@/components/site";
import { requireOrg } from "@/lib/auth/session";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { org } = await requireOrg("supplier", "/fornecedor");
  return (
    <PanelShell title="Painel do fornecedor" orgName={org.trade_name ?? org.legal_name} nav={[
      { href: "/fornecedor", label: "Visão geral" },
      { href: "/fornecedor/atas", label: "Minhas atas" },
      { href: "/fornecedor/atas/nova", label: "Cadastrar ata" },
      { href: "/fornecedor/solicitacoes", label: "Solicitações recebidas" },
      { href: "/fornecedor/oportunidades", label: "Oportunidades (CRM)" },
      { href: "/fornecedor/relatorios", label: "Relatórios" },
      { href: "/fornecedor/perfil", label: "Perfil empresarial" },
      { href: "/fornecedor/reivindicar", label: "Reivindicar atas" },
      { href: "/fornecedor/equipe", label: "Equipe" },
      { href: "/fornecedor/assinatura", label: "Assinatura" },
      { href: "/conta", label: "Minha conta" },
    ]}>{children}</PanelShell>
  );
}

import { PanelShell } from "@/components/site";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <PanelShell title="Administração" nav={[
      { href: "/admin", label: "Indicadores" },
      { href: "/admin/atas?fila=1", label: "Moderação de atas" },
      { href: "/admin/atas", label: "Todas as atas" },
      { href: "/admin/documentos", label: "Documentos" },
      { href: "/admin/reivindicacoes", label: "Reivindicações" },
      { href: "/admin/organizacoes", label: "Fornecedores e órgãos" },
      { href: "/admin/usuarios", label: "Usuários" },
      { href: "/admin/assinaturas", label: "Assinaturas e pagamentos" },
      { href: "/admin/planos", label: "Planos" },
      { href: "/admin/categorias", label: "Categorias" },
      { href: "/admin/fontes", label: "Fontes e integrações" },
      { href: "/admin/auditoria", label: "Auditoria" },
      { href: "/admin/lgpd", label: "LGPD" },
    ]}>{children}</PanelShell>
  );
}

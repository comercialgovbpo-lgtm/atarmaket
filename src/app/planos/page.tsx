import { PlanCards, type PlanRow } from "@/components/plans";
import { LinkButton, Notice } from "@/components/ui";
import { anonDb } from "@/lib/db";

export const metadata = { title: "Planos e licenças" };

export default async function PlansPage() {
  const plans = await anonDb((tx) => tx.many<PlanRow & { audience: string }>("SELECT * FROM subscription_plans WHERE active AND price_cents > 0 ORDER BY sort_order"));
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Para empresas fornecedoras</p>
        <h1 className="mt-2 text-3xl font-semibold text-navy-900">Amplie a exposição comercial das suas atas</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Assinatura mensal, sem comissão sobre adesões. Cancele quando quiser.</p>
        <div className="mt-8"><PlanCards plans={plans.filter((p) => p.audience === "supplier")} highlight="profissional" /></div>
        <LinkButton href="/cadastro/fornecedor" className="mt-6">Cadastrar minha empresa</LinkButton>
      </section>
      <section id="orgaos" className="mt-20 scroll-mt-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Para órgãos públicos</p>
        <h2 className="mt-2 text-3xl font-semibold text-navy-900">Inteligência para compras públicas</h2>
        <p className="mt-2 max-w-2xl text-slate-600">A busca básica é pública e gratuita. Licenças anuais liberam pesquisa avançada, comparador, alertas, relatórios e gestão de oportunidades. Órgãos cadastrados recebem período de avaliação.</p>
        <div className="mt-8"><PlanCards plans={plans.filter((p) => p.audience === "government")} highlight="orgao_institucional" /></div>
        <Notice tone="gray" className="mt-6">A contratação de licenças por órgãos públicos observa os procedimentos administrativos e legais aplicáveis ao contratante. Fornecemos proposta comercial e documentação de suporte.</Notice>
        <LinkButton href="/cadastro/orgao" variant="navy" className="mt-6">Cadastrar meu órgão</LinkButton>
      </section>
    </div>
  );
}

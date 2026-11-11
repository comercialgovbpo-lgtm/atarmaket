import Link from "next/link";
import {
  Armchair, ArrowRight, Briefcase, Fuel, GraduationCap, HardHat, Monitor, Package, PenLine, Shield, Sparkles, Stethoscope, Truck, Utensils,
  type LucideIcon, Search, Handshake, FileCheck2,
} from "lucide-react";
import { AtaResultCard } from "@/components/ata-bits";
import { SearchBar } from "@/components/search-bar";
import { Card, LinkButton } from "@/components/ui";
import { anonDb } from "@/lib/db";
import { categoriesWithCounts, featuredSuppliers, platformStats } from "@/lib/atas/queries";
import { searchAtas } from "@/lib/atas/search";

export const dynamic = "force-dynamic";

const ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope, monitor: Monitor, truck: Truck, fuel: Fuel, utensils: Utensils, sparkles: Sparkles, pen: PenLine,
  armchair: Armchair, "hard-hat": HardHat, briefcase: Briefcase, "graduation-cap": GraduationCap, shield: Shield, package: Package,
};

export default async function Home() {
  const { stats, cats, recent, featured, suppliers } = await anonDb(async (tx) => ({
    stats: await platformStats(tx),
    cats: await categoriesWithCounts(tx),
    recent: (await searchAtas(tx, { ordem: "recentes" }, { pageSize: 4 })).rows,
    featured: (await searchAtas(tx, { status: "verificada,fornecedor_confirmado,vigencia_confirmada,disponibilidade_consultada,cadastrada" }, { pageSize: 2 })).rows,
    suppliers: await featuredSuppliers(tx, 6),
  }));
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("pt-BR");

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-navy-50 to-white">
        <div className="mx-auto max-w-5xl px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Marketplace Nacional de Atas Públicas</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-navy-900 sm:text-5xl">
            Milhares de oportunidades em atas públicas em um só lugar.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Encontre produtos e serviços registrados em atas públicas e conecte-se diretamente aos fornecedores.
          </p>
          <div className="mx-auto mt-8 max-w-3xl"><SearchBar big /></div>
          <p className="mt-3 text-xs text-slate-500">Busca pública e gratuita, sem necessidade de login · Dados com fonte oficial e data de coleta</p>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-t-xl border-x border-t border-slate-200 bg-slate-200 sm:grid-cols-4">
          {[
            ["Atas na base", n(stats?.atas)],
            ["Atas vigentes*", n(stats?.vigentes)],
            ["Itens com preço registrado", n(stats?.itens)],
            ["Órgãos gerenciadores", n(stats?.orgaos)],
          ].map(([l, v]) => (
            <div key={l} className="bg-white px-4 py-5 text-center">
              <p className="text-2xl font-semibold tabular text-navy-800">{v}</p>
              <p className="mt-0.5 text-xs text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      </section>
      <p className="mx-auto max-w-5xl px-4 pt-2 text-right text-[11px] text-slate-400">*Vigência pela data informada na fonte; não indica saldo ou aptidão para adesão.</p>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold text-navy-900">Categorias</h2>
          <Link href="/atas" className="text-sm font-medium text-brand-700 hover:underline">Ver todas as atas</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cats.filter((c) => c.slug !== "outros").map((c) => {
            const Icon = ICONS[c.icon ?? ""] ?? Package;
            return (
              <Link key={c.id} href={`/atas?categoria=${c.slug}`} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-brand-500 hover:bg-brand-50/40">
                <Icon className="size-5 shrink-0 text-navy-700 group-hover:text-brand-600" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                  <span className="text-xs text-slate-500">{c.n.toLocaleString("pt-BR")} vigentes</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
          <h2 className="text-xl font-semibold text-navy-900">Atas em destaque</h2>
          <p className="mt-1 text-sm text-slate-500">Atas com conferência documental ou cadastradas por fornecedores com conta na plataforma.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">{featured.map((r) => <AtaResultCard key={r.id} r={r} />)}</div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold text-navy-900">Atas recentemente cadastradas</h2>
          <Link href="/atas?ordem=recentes" className="text-sm font-medium text-brand-700 hover:underline">Ver mais</Link>
        </div>
        {recent.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">{recent.map((r) => <AtaResultCard key={r.id} r={r} />)}</div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">A base está sendo sincronizada com as fontes oficiais.</p>
        )}
      </section>

      {suppliers.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <h2 className="text-xl font-semibold text-navy-900">Fornecedores com atas vigentes</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <Link key={s.id} href={`/fornecedores/${s.id}`} className="rounded-xl border border-slate-200 p-4 hover:border-brand-500">
                <p className="truncate font-medium text-slate-900">{s.trade_name ?? s.legal_name}</p>
                <p className="text-xs text-slate-500">{s.city ? `${s.city}/${s.state} · ` : ""}{s.n} ata(s) vigente(s){s.account_linked ? " · Perfil verificado" : ""}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { i: Search, t: "Descubra", d: "Busca unificada por produto, serviço, CATMAT/CATSER, fornecedor, órgão, região, vigência e preço." },
            { i: FileCheck2, t: "Confira", d: "Cada ata mostra fonte oficial, data de coleta, status de validação e um apoio à conferência do art. 86." },
            { i: Handshake, t: "Conecte-se", d: "Solicite informações ao fornecedor. A manifestação comercial não substitui a autorização do gerenciador." },
          ].map((b) => (
            <Card key={b.t} className="p-6">
              <b.i className="size-6 text-brand-600" aria-hidden />
              <h3 className="mt-3 font-semibold text-navy-900">{b.t}</h3>
              <p className="mt-1 text-sm text-slate-600">{b.d}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-6 sm:px-6 md:grid-cols-2">
        <div className="rounded-2xl bg-navy-800 p-8 text-white">
          <h2 className="text-2xl font-semibold">Sua empresa tem atas vigentes?</h2>
          <p className="mt-2 text-slate-300">Amplie a exposição comercial das suas atas para órgãos de todo o país e acompanhe os interessados em um CRM simples.</p>
          <LinkButton href="/cadastro/fornecedor" className="mt-6 bg-white !text-navy-900 hover:bg-slate-100">Cadastrar minha empresa <ArrowRight className="size-4" /></LinkButton>
        </div>
        <div id="orgaos" className="rounded-2xl border border-slate-200 p-8">
          <h2 className="text-2xl font-semibold text-navy-900">Para órgãos públicos</h2>
          <p className="mt-2 text-slate-600">Pesquisa avançada, comparador de até 5 atas, favoritos, alertas de vencimento e histórico de pesquisas — com período de avaliação.</p>
          <LinkButton href="/cadastro/orgao" variant="navy" className="mt-6">Acessar como órgão público <ArrowRight className="size-4" /></LinkButton>
        </div>
      </section>
    </>
  );
}

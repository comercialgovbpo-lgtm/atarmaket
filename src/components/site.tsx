import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/(auth)/actions";
import { userDb } from "@/lib/auth/session";
import { LinkButton } from "./ui";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "AtaMarket";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${APP_NAME} — início`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#ffffff" : "#0f2240"} />
        <path d="M9 22V10h9.5a4.5 4.5 0 0 1 0 9H13" fill="none" stroke={light ? "#0f2240" : "#ffffff"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22.5" cy="22" r="2.2" fill="#2563eb" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-navy-900"}`}>{APP_NAME}</span>
    </Link>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await userDb((tx) => tx.one<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [user.id])) : null;
  const panelHref = user?.platform_role === "admin" ? "/admin" : user?.activeOrg?.kind === "government" ? "/orgao" : user?.activeOrg?.kind === "supplier" ? "/fornecedor" : "/conta";
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm font-medium text-slate-600 md:flex" aria-label="Principal">
          <Link className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900" href="/atas">Buscar atas</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900" href="/planos">Planos</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900" href="/planos#orgaos">Para órgãos públicos</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900" href="/sobre-os-dados">Sobre os dados</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/notificacoes" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Notificações">
                <Bell className="size-5" />
                {unread && unread.n > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{unread.n}</span>}
              </Link>
              <LinkButton href={panelHref} variant="navy" s="sm">Meu painel</LinkButton>
              <form action={logoutAction}>
                <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Sair" title="Sair"><LogOut className="size-4" /></button>
              </form>
            </>
          ) : (
            <>
              <LinkButton href="/entrar" variant="ghost" s="sm">Entrar</LinkButton>
              <LinkButton href="/cadastro" s="sm">Cadastrar</LinkButton>
            </>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1 text-sm md:hidden" aria-label="Principal (móvel)">
        <Link className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-600" href="/atas">Buscar atas</Link>
        <Link className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-600" href="/planos">Planos</Link>
        <Link className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-600" href="/sobre-os-dados">Sobre os dados</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-navy-900 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-3 max-w-md text-sm text-slate-400">
            Marketplace nacional de descoberta e conexão comercial em Atas de Registro de Preços. Não substitui os procedimentos
            administrativos e jurídicos de adesão, que cabem a cada órgão interessado.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Plataforma</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/atas" className="hover:text-white">Buscar atas</Link></li>
            <li><Link href="/cadastro/fornecedor" className="hover:text-white">Cadastrar minha empresa</Link></li>
            <li><Link href="/cadastro/orgao" className="hover:text-white">Acesso para órgãos públicos</Link></li>
            <li><Link href="/planos" className="hover:text-white">Planos e licenças</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Transparência</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/sobre-os-dados" className="hover:text-white">Fontes e metodologia</Link></li>
            <li><Link href="/termos" className="hover:text-white">Termos de uso</Link></li>
            <li><Link href="/privacidade" className="hover:text-white">Política de privacidade</Link></li>
            <li><Link href="/lgpd" className="hover:text-white">Direitos do titular (LGPD)</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">
        Dados públicos obtidos do PNCP (Lei 14.133/2021, art. 174) com indicação de fonte. © {new Date().getFullYear()} {APP_NAME}.
      </div>
    </footer>
  );
}

export function PanelShell({ title, nav, children, orgName }: { title: string; nav: { href: string; label: string }[]; children: React.ReactNode; orgName?: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:flex lg:gap-8">
      <aside className="mb-6 lg:mb-0 lg:w-56 lg:shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        {orgName && <p className="mt-1 truncate text-sm font-medium text-navy-800" title={orgName}>{orgName}</p>}
        <nav className="mt-3 flex gap-1 overflow-x-auto lg:flex-col" aria-label={title}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-navy-900">{n.label}</Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

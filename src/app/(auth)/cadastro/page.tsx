import Link from "next/link";
import { Building2, Landmark } from "lucide-react";

export const metadata = { title: "Cadastro" };

export default function SignupChoice() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-center text-3xl font-semibold text-navy-900">Como você vai usar a plataforma?</h1>
      <p className="mt-2 text-center text-slate-600">A busca de atas é pública e gratuita. O cadastro libera os painéis e ferramentas.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {[
          { href: "/cadastro/fornecedor", icon: Building2, t: "Sou empresa fornecedora", d: "Cadastre suas atas, ganhe exposição no marketplace e receba contatos de órgãos interessados." },
          { href: "/cadastro/orgao", icon: Landmark, t: "Sou órgão público", d: "Pesquise, compare e acompanhe atas; solicite informações a fornecedores. Inclui período de avaliação." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-2xl border border-slate-200 p-8 transition hover:border-brand-500 hover:shadow-lg">
            <c.icon className="size-10 text-brand-600" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-navy-900">{c.t}</h2>
            <p className="mt-2 text-sm text-slate-600">{c.d}</p>
            <span className="mt-6 inline-block text-sm font-medium text-brand-700 group-hover:underline">Continuar →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

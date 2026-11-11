import { LinkButton } from "@/components/ui";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">Página não encontrada</h1>
      <p className="mt-2 text-slate-600">O registro pode ter sido removido, não publicado ou você não tem permissão de acesso.</p>
      <LinkButton href="/atas" className="mt-6">Buscar atas</LinkButton>
    </div>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold text-navy-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Última atualização: {updated}. Documento-base a ser revisado pela assessoria jurídica da operadora antes da entrada em produção.</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-navy-900 [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}

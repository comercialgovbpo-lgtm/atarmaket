"use client";
export default function Error({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-navy-900">Não foi possível concluir a operação</h1>
      <p className="mt-2 text-slate-600">Tente novamente. Se o problema persistir, informe o código {error.digest ?? "—"} ao suporte.</p>
      <button onClick={reset} className="mt-6 h-10 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">Tentar novamente</button>
    </div>
  );
}

import Link from "next/link";

export function ConsentFields({ marketing = false }: { marketing?: boolean }) {
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="accept_terms" required className="mt-1" />
        <span>Li e aceito os <Link href="/termos" target="_blank" className="text-brand-700 underline">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank" className="text-brand-700 underline">Política de Privacidade</Link>, e declaro ter poderes para representar a instituição informada.</span>
      </label>
      {marketing && (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="marketing" className="mt-1" />
          <span>Aceito receber comunicações sobre oportunidades e novidades (opcional, revogável a qualquer momento).</span>
        </label>
      )}
    </div>
  );
}

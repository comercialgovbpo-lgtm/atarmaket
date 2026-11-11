import { StatusBadge } from "@/components/ata-bits";
import { Card } from "@/components/ui";
import { anonDb } from "@/lib/db";
import { STATUS_INFO, type AtaStatus } from "@/lib/atas/status";
import { dateTimeBR } from "@/lib/format";

export const metadata = { title: "Fontes e metodologia" };

export default async function About() {
  const sources = await anonDb((tx) => tx.many<{ name: string; kind: string; docs_url: string | null; terms_notes: string | null; last_sync_at: Date | null; n: number }>(
    "SELECT s.name, s.kind, s.docs_url, s.terms_notes, s.last_sync_at, (SELECT count(*)::int FROM price_registration_atas a WHERE a.source_id = s.id AND ata_status_is_public(a.status)) n FROM ata_sources s WHERE s.active ORDER BY s.code"));
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold text-navy-900">Fontes e metodologia</h1>
      <p className="mt-2 text-slate-600">Transparência sobre de onde vêm os dados e o que cada status significa.</p>
      <h2 className="mt-10 text-xl font-semibold text-navy-900">Fontes</h2>
      <div className="mt-4 space-y-3">{sources.map((s) => (
        <Card key={s.name} className="p-5 text-sm">
          <p className="font-medium text-slate-900">{s.name} · {s.n.toLocaleString("pt-BR")} ata(s) publicadas</p>
          {s.terms_notes && <p className="mt-1 text-slate-600">{s.terms_notes}</p>}
          <p className="mt-1 text-xs text-slate-500">Última sincronização: {dateTimeBR(s.last_sync_at)}{s.docs_url ? <> · <a className="text-brand-700 underline" href={s.docs_url} target="_blank" rel="noopener noreferrer">documentação oficial</a></> : null}</p>
        </Card>))}</div>
      <h2 className="mt-10 text-xl font-semibold text-navy-900">Status de validação</h2>
      <div className="mt-4 space-y-2">{(Object.keys(STATUS_INFO) as AtaStatus[]).filter((s) => STATUS_INFO[s].public || s === "em_validacao").map((s) => (
        <div key={s} className="flex gap-3 text-sm"><span className="w-48 shrink-0"><StatusBadge status={s} /></span><span className="text-slate-700">{STATUS_INFO[s].help}</span></div>))}</div>
      <h2 className="mt-10 text-xl font-semibold text-navy-900">Conceitos que não se confundem</h2>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        <li><strong>Ata publicada:</strong> divulgada na fonte oficial ou na plataforma.</li>
        <li><strong>Ata vigente:</strong> dentro do prazo de vigência informado (sujeito a confirmação).</li>
        <li><strong>Saldo disponível:</strong> quantidade ainda não utilizada — conhecida apenas pelo órgão gerenciador; a plataforma não confirma saldo.</li>
        <li><strong>Ata apta à adesão:</strong> depende de previsão no edital, limites do art. 86, aceite do gerenciador e do fornecedor e instrução processual do órgão interessado.</li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold text-navy-900">Vínculo de itens</h2>
      <p className="mt-2 text-sm text-slate-700">A API pública do PNCP informa os itens e resultados (fornecedor e preço homologado) da contratação, mas não indica a qual ata cada item pertence quando a contratação gerou várias atas. Nesses casos os itens são exibidos como “da contratação de origem”, com aviso. Quando há uma única ata, o vínculo é feito automaticamente e identificado como tal.</p>
    </div>
  );
}

import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { activeProvider } from "@/lib/payments";
import { dateTimeBR } from "@/lib/format";
import { expireNowAction, saveSourceAction, triggerItemsBackfillAction, triggerSyncAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Fontes e integrações" };

export default async function Sources({ searchParams }: { searchParams: Promise<{ disparada?: string }> }) {
  const sp = await searchParams;
  const { sources, logs, counts } = await adminRead(async (tx) => ({
    sources: await tx.many<{ id: string; code: string; name: string; kind: string; base_url: string | null; docs_url: string | null; active: boolean; config: Record<string, unknown>; terms_notes: string | null; last_sync_at: Date | null; last_sync_cursor: string | null }>("SELECT * FROM ata_sources ORDER BY code"),
    logs: await tx.many<{ id: string; job: string; status: string; fetched: number; created: number; updated: number; unchanged: number; expired: number; duplicates: number; errors: number; triggered_by: string; started_at: Date; finished_at: Date | null; error_details: { ref: string; error: string }[] }>(
      "SELECT * FROM synchronization_logs ORDER BY started_at DESC LIMIT 30"),
    counts: await tx.many<{ code: string; n: number }>("SELECT s.code, count(a.id)::int n FROM ata_sources s LEFT JOIN price_registration_atas a ON a.source_id = s.id GROUP BY s.code"),
  }));
  const provider = activeProvider();
  return (
    <>
      <PageHeader title="Fontes de dados e integrações" description="Arquitetura de conectores: cada fonte registra origem, URL, data de coleta, atualização e histórico de sincronização." />
      {sp.disparada && <Notice tone="green" className="mb-4">Sincronização iniciada em segundo plano. Acompanhe no histórico abaixo.</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Sincronizar PNCP agora" description="O agendamento automático usa /api/cron/sync (CRON_SECRET)." />
          <form action={triggerSyncAction} className="grid gap-3 p-5 sm:grid-cols-3">
            <Field label="Modo"><Select name="mode" defaultValue="atualizacao"><option value="atualizacao">Atualizadas recentemente</option><option value="vigencia">Vigentes hoje</option></Select></Field>
            <Field label="Janela (dias)"><Input name="days" type="number" min={1} max={30} defaultValue={2} /></Field>
            <Field label="Páginas (máx.)"><Input name="pages" type="number" min={1} max={200} defaultValue={5} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="items" defaultChecked />Buscar itens e preços na mesma execução (mais lento)</label>
            <div className="flex gap-2 sm:col-span-3"><SubmitButton>Iniciar sincronização</SubmitButton></div>
          </form>
          <form action={triggerItemsBackfillAction} className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-5 py-4">
            <Field label="Contratações sem itens a processar"><Input name="limit" type="number" min={1} max={500} defaultValue={50} className="w-32" /></Field>
            <SubmitButton variant="secondary">Buscar itens pendentes</SubmitButton>
          </form>
          <form action={expireNowAction} className="border-t border-slate-100 px-5 py-3"><button className="text-sm text-brand-700 hover:underline">Executar rotina de encerramento de atas vencidas</button></form>
        </Card>
        <Card><CardHeader title="Integrações" />
          <ul className="divide-y divide-slate-100 text-sm">
            <li className="flex justify-between px-5 py-3"><span>Pagamentos</span><Badge tone={provider ? "green" : "gray"}>{provider ? provider.name : "não configurado"}</Badge></li>
            <li className="flex justify-between px-5 py-3"><span>IA para extração de documentos</span><Badge tone={process.env.ANTHROPIC_API_KEY ? "green" : "gray"}>{process.env.ANTHROPIC_API_KEY ? (process.env.EXTRACTION_MODEL ?? "claude-opus-5-5") : "não configurada (heurística)"}</Badge></li>
            <li className="flex justify-between px-5 py-3"><span>Armazenamento de documentos</span><Badge tone="green">{process.env.STORAGE_DRIVER ?? "local"}</Badge></li>
            <li className="flex justify-between px-5 py-3"><span>E-mail (fila email_outbox)</span><Badge tone={process.env.SMTP_URL ? "green" : "gray"}>{process.env.SMTP_URL ? "SMTP" : "fila sem envio"}</Badge></li>
          </ul>
        </Card>
      </div>
      <div className="mt-6 space-y-4">
        {sources.map((s) => (
          <Card key={s.id}><CardHeader title={s.name} description={`${s.kind} · ${counts.find((c) => c.code === s.code)?.n ?? 0} ata(s) · última sincronização ${dateTimeBR(s.last_sync_at)}${s.last_sync_cursor ? ` · cursor ${s.last_sync_cursor}` : ""}`} action={<Badge tone={s.active ? "green" : "gray"}>{s.active ? "Ativa" : "Inativa"}</Badge>} />
            <ActionForm action={saveSourceAction} className="grid gap-3 p-5 sm:grid-cols-2">
              <input type="hidden" name="id" value={s.id} />
              <Field label="Configuração (JSON)"><Textarea name="config" rows={4} defaultValue={JSON.stringify(s.config, null, 1)} className="font-mono text-xs" /></Field>
              <Field label="Termos de uso / observações">
                <Textarea name="terms_notes" rows={4} defaultValue={s.terms_notes ?? ""} />
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} />Fonte ativa</label>
              <div className="flex items-center justify-end gap-3 text-sm">{s.docs_url && <a href={s.docs_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Documentação</a>}<SubmitButton s="sm" variant="secondary">Salvar</SubmitButton></div>
            </ActionForm>
          </Card>
        ))}
      </div>
      <Card className="mt-6"><CardHeader title="Histórico de sincronização" />
        <Table><thead><tr><Th>Início</Th><Th>Rotina</Th><Th>Status</Th><Th className="text-right">Lidas</Th><Th className="text-right">Novas</Th><Th className="text-right">Atualizadas</Th><Th className="text-right">Sem alteração</Th><Th className="text-right">Encerradas</Th><Th className="text-right">Duplicidades</Th><Th className="text-right">Erros</Th><Th>Origem</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{logs.map((l) => (
            <tr key={l.id}><Td className="whitespace-nowrap text-xs">{dateTimeBR(l.started_at)}</Td><Td>{l.job}</Td>
              <Td><Badge tone={l.status === "sucesso" ? "green" : l.status === "executando" ? "blue" : l.status === "parcial" ? "amber" : "red"}>{l.status}</Badge>{l.error_details?.length > 0 && <details className="text-[11px] text-slate-500"><summary>detalhes</summary>{l.error_details.slice(0, 5).map((e, i) => <p key={i}>{e.ref}: {e.error}</p>)}</details>}</Td>
              {[l.fetched, l.created, l.updated, l.unchanged, l.expired, l.duplicates, l.errors].map((v, i) => <Td key={i} className="text-right tabular">{v}</Td>)}<Td className="text-xs">{l.triggered_by}</Td></tr>
          ))}</tbody></Table>
      </Card>
    </>
  );
}

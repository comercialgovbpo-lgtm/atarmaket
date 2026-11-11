import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { dateTimeBR } from "@/lib/format";
import { resolveDsrAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "LGPD" };

export default async function Lgpd() {
  const rows = await adminRead((tx) => tx.many<{ id: string; email: string; kind: string; details: string | null; status: string; response: string | null; created_at: Date; resolved_at: Date | null }>(
    "SELECT * FROM data_subject_requests ORDER BY (status IN ('aberta','em_atendimento')) DESC, created_at DESC LIMIT 200"));
  return (
    <>
      <PageHeader title="Solicitações de titulares (LGPD)" description="Acesso, correção, exclusão, portabilidade e revogação de consentimento. Responder no prazo legal (art. 19 da Lei 13.709/2018)." />
      {rows.length === 0 ? <Empty title="Nenhuma solicitação" /> : <div className="space-y-3">{rows.map((r) => (
        <Card key={r.id} className="p-5 text-sm">
          <div className="flex justify-between"><p className="font-medium">{r.kind} · {r.email}</p><Badge tone={r.status === "concluida" ? "green" : r.status === "indeferida" ? "red" : "amber"}>{r.status}</Badge></div>
          <p className="text-xs text-slate-500">{dateTimeBR(r.created_at)}{r.resolved_at ? ` · resolvida ${dateTimeBR(r.resolved_at)}` : ""}</p>
          {r.details && <p className="mt-2">{r.details}</p>}
          {r.response && <p className="mt-2 rounded bg-slate-50 p-2 text-slate-700">{r.response}</p>}
          {!r.resolved_at && <form action={resolveDsrAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={r.id} />
            <input name="response" placeholder="Resposta ao titular (enviada por e-mail)" className="h-9 flex-1 rounded-lg border border-slate-300 px-2" />
            <button name="status" value="em_atendimento" className="h-9 rounded-lg border border-slate-300 px-3">Em atendimento</button>
            <button name="status" value="concluida" className="h-9 rounded-lg bg-ok-600 px-3 text-white">Concluir</button>
            <button name="status" value="indeferida" className="h-9 rounded-lg border border-red-300 px-3 text-red-700">Indeferir</button></form>}
        </Card>))}</div>}
    </>
  );
}

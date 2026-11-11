import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { CONTACT_STATUS } from "@/lib/atas/status";
import { dateTimeBR, num } from "@/lib/format";
import { closeRequestAction } from "../actions";

export const metadata = { title: "Solicitações enviadas" };

export default async function Requests() {
  const { org } = await requireOrg("government");
  const rows = await userDb((tx) => tx.many<{ id: string; ata_id: string; ata_number: string; kind: string; status: string; message: string; intended_quantity: string | null; supplier_response: string | null; responded_at: Date | null; created_at: Date; supplier: string | null; item: string | null }>(
    `SELECT r.id, r.ata_id, a.ata_number, r.kind, r.status, r.message, r.intended_quantity, r.supplier_response, r.responded_at, r.created_at,
            s.legal_name AS supplier, i.description AS item
       FROM contact_requests r JOIN price_registration_atas a ON a.id = r.ata_id
       LEFT JOIN suppliers s ON s.id = r.supplier_id LEFT JOIN ata_items i ON i.id = r.ata_item_id
      WHERE r.requester_org_id = $1 ORDER BY r.created_at DESC`, [org.organization_id]));
  return (
    <>
      <PageHeader title="Solicitações enviadas" description="Pedidos de informação e manifestações de interesse. Não constituem adesão nem compromisso de contratação." />
      {rows.length === 0 ? <Empty title="Nenhuma solicitação enviada" /> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/atas/${r.ata_id}`} className="font-semibold text-navy-900 hover:text-brand-700">Ata {r.ata_number} · {r.supplier ?? "Fornecedor"}</Link>
                <div className="flex items-center gap-2"><Badge tone={r.status === "respondida" ? "green" : r.status === "aguardando_fornecedor" ? "amber" : "blue"}>{CONTACT_STATUS[r.status]}</Badge><span className="text-xs text-slate-500">{dateTimeBR(r.created_at)}</span></div>
              </div>
              {r.item && <p className="mt-1 text-slate-600">Item: {r.item}{r.intended_quantity ? ` · Qtd. pretendida: ${num(r.intended_quantity)}` : ""}</p>}
              <p className="mt-2 whitespace-pre-line text-slate-700">{r.message}</p>
              {r.supplier_response && <div className="mt-3 rounded-lg bg-ok-50 p-3"><p className="text-xs font-medium text-ok-700">Resposta do fornecedor · {dateTimeBR(r.responded_at)}</p><p className="mt-1 whitespace-pre-line text-slate-800">{r.supplier_response}</p></div>}
              {r.status === "aguardando_fornecedor" && <p className="mt-2 text-xs text-amber-700">O fornecedor ainda não possui conta na plataforma; a solicitação ficará disponível quando a titularidade for comprovada.</p>}
              {r.status !== "encerrada" && <form action={closeRequestAction} className="mt-3"><input type="hidden" name="id" value={r.id} /><button className="text-xs text-slate-500 hover:underline">Encerrar solicitação</button></form>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

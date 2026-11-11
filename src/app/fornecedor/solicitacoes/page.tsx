import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, Textarea } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { CONTACT_STATUS } from "@/lib/atas/status";
import { dateTimeBR, num } from "@/lib/format";
import { markContactViewedAction, respondContactAction } from "../actions";

export const metadata = { title: "Solicitações recebidas" };

export default async function Received() {
  await requireOrg("supplier");
  const rows = await userDb((tx) => tx.many<{ id: string; ata_id: string; ata_number: string; kind: string; status: string; message: string; intended_quantity: string | null; contact_name: string; contact_email: string; contact_phone: string | null; supplier_response: string | null; created_at: Date; org_name: string | null; item: string | null; opp_id: string | null }>(
    `SELECT r.id, r.ata_id, a.ata_number, r.kind, r.status, r.message, r.intended_quantity, r.contact_name, r.contact_email, r.contact_phone,
            r.supplier_response, r.created_at, o.government_name AS org_name, i.description AS item, o.id AS opp_id
       FROM contact_requests r JOIN price_registration_atas a ON a.id = r.ata_id
       LEFT JOIN commercial_opportunities o ON o.contact_request_id = r.id LEFT JOIN ata_items i ON i.id = r.ata_item_id
      WHERE r.supplier_id IN (SELECT app_supplier_ids()) ORDER BY r.created_at DESC`));
  return (
    <>
      <PageHeader title="Solicitações recebidas" description="Pedidos de órgãos públicos. A manifestação não representa adesão nem autorização do órgão gerenciador." />
      {rows.length === 0 ? <Empty title="Nenhuma solicitação recebida">Solicitações chegam quando órgãos demonstram interesse nas suas atas.</Empty> : (
        <div className="space-y-4">{rows.map((r) => (
          <Card key={r.id} className="p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-navy-900">{r.org_name ?? "Órgão público"} · <Link href={`/atas/${r.ata_id}`} className="text-brand-700 hover:underline">Ata {r.ata_number}</Link></p>
              <span className="flex items-center gap-2"><Badge tone={r.kind === "interesse_comercial" ? "green" : "blue"}>{r.kind === "interesse_comercial" ? "Interesse comercial" : "Pedido de informações"}</Badge><Badge>{CONTACT_STATUS[r.status]}</Badge><span className="text-xs text-slate-500">{dateTimeBR(r.created_at)}</span></span>
            </div>
            {r.item && <p className="mt-1 text-slate-600">Item: {r.item}{r.intended_quantity ? ` · Quantidade pretendida: ${num(r.intended_quantity)}` : ""}</p>}
            <p className="mt-2 whitespace-pre-line text-slate-800">{r.message}</p>
            <p className="mt-2 text-xs text-slate-500">Contato: {r.contact_name} · {r.contact_email}{r.contact_phone ? ` · ${r.contact_phone}` : ""}</p>
            {r.opp_id && <Link href={`/fornecedor/oportunidades/${r.opp_id}`} className="mt-1 inline-block text-xs text-brand-700 hover:underline">Abrir no CRM</Link>}
            {r.supplier_response ? <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Sua resposta</p><p className="whitespace-pre-line">{r.supplier_response}</p></div> : (
              <>
                {r.status === "enviada" && <form action={markContactViewedAction} className="mt-2"><input type="hidden" name="id" value={r.id} /><button className="text-xs text-slate-500 hover:underline">Marcar como visualizada</button></form>}
                <ActionForm action={respondContactAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Textarea name="response" rows={3} required placeholder="Responda com disponibilidade, condições e documentação. Lembre o órgão de que a adesão depende de autorização do gerenciador." />
                  <SubmitButton s="sm">Enviar resposta</SubmitButton>
                </ActionForm>
              </>
            )}
          </Card>
        ))}</div>
      )}
    </>
  );
}

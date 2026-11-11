import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { dateTimeBR, formatCnpj } from "@/lib/format";
import { reviewClaimAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Reivindicações" };

export default async function Claims() {
  const rows = await adminRead((tx) => tx.many<{ id: string; status: string; relationship: string; justification: string; created_at: Date; review_notes: string | null; supplier: string; supplier_cnpj: string; org: string; org_cnpj: string; ata_id: string | null; ata_number: string | null; evidence_document_ids: string[]; user_email: string }>(
    `SELECT c.*, s.legal_name supplier, s.cnpj supplier_cnpj, o.legal_name org, o.cnpj org_cnpj, a.ata_number, u.email user_email
       FROM supplier_claims c JOIN suppliers s ON s.id = c.supplier_id JOIN organizations o ON o.id = c.claimant_org_id JOIN users u ON u.id = c.claimant_user_id
       LEFT JOIN price_registration_atas a ON a.id = c.ata_id ORDER BY (c.status = 'pendente') DESC, c.created_at DESC LIMIT 200`));
  return (
    <>
      <PageHeader title="Reivindicações de titularidade e representação" description="Aprovar vincula o fornecedor à conta da empresa e, quando houver ata, confirma o fornecedor." />
      {rows.length === 0 ? <Empty title="Nenhuma reivindicação" /> : <div className="space-y-3">{rows.map((c) => (
        <Card key={c.id} className="p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{c.org} <span className="font-normal text-slate-500">({formatCnpj(c.org_cnpj)}) reivindica</span> {c.supplier} <span className="font-normal text-slate-500">({formatCnpj(c.supplier_cnpj)})</span></p>
            <Badge tone={c.status === "aprovada" ? "green" : c.status === "rejeitada" ? "red" : "amber"}>{c.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{c.relationship === "titular" ? "Titular" : "Representante comercial"} · {c.ata_id ? <Link className="text-brand-700 underline" href={`/admin/atas/${c.ata_id}`}>Ata {c.ata_number}</Link> : "Perfil da empresa"} · {c.user_email} · {dateTimeBR(c.created_at)}</p>
          {c.org_cnpj !== c.supplier_cnpj && c.relationship === "titular" && <p className="mt-1 text-xs font-medium text-red-700">Atenção: CNPJ da conta difere do CNPJ do fornecedor reivindicado.</p>}
          <p className="mt-2 text-slate-700">{c.justification}</p>
          <p className="mt-2 flex flex-wrap gap-3">{c.evidence_document_ids.map((d, i) => <a key={d} href={`/api/documentos/${d}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Evidência {i + 1}</a>)}{c.evidence_document_ids.length === 0 && <span className="text-xs text-slate-500">Sem documento anexado (cadastro inicial) — solicite evidência antes de aprovar.</span>}</p>
          {c.status === "pendente" ? (
            <form action={reviewClaimAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={c.id} />
              <input name="notes" placeholder="Parecer (enviado ao solicitante)" className="h-9 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
              <button name="decision" value="aprovada" className="h-9 rounded-lg bg-ok-600 px-3 text-sm text-white">Aprovar</button>
              <button name="decision" value="rejeitada" className="h-9 rounded-lg border border-red-300 px-3 text-sm text-red-700">Rejeitar</button></form>
          ) : c.review_notes && <p className="mt-2 text-xs text-slate-500">Parecer: {c.review_notes}</p>}
        </Card>))}</div>}
    </>
  );
}

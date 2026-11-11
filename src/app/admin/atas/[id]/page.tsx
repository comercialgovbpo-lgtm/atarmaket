import Link from "next/link";
import { notFound } from "next/navigation";
import { OriginBadge, StatusBadge } from "@/components/ata-bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Dl, Field, Input, Notice, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { ADHESION_CHECKLIST } from "@/lib/atas/compliance";
import { MODERATION_TARGETS, STATUS_INFO, type AtaStatus } from "@/lib/atas/status";
import { brl, dateBR, dateTimeBR, formatCnpj, num } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";
import { assessAtaAction, markDuplicateAction, moderateAtaAction } from "../../actions";
import { adminRead } from "../../db";

export const metadata = { title: "Moderação de ata" };

export default async function AdminAta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await adminRead(async (tx) => {
    const a = await tx.one<{ id: string; ata_number: string; object: string; status: string; origin: string; moderation_notes: string | null; documents_verified: boolean; supplier_confirmed: boolean; validity_confirmed: boolean; availability_checked_at: Date | null; featured: boolean; category_id: string | null; validity_start: string | null; validity_end: string | null; signature_date: string | null; manager: string | null; manager_cnpj: string | null; org: string | null; org_cnpj: string | null; org_status: string | null; supplier: string | null; supplier_cnpj: string | null; source_name: string; external_id: string | null; source_url: string | null; procurement_record_id: string | null; duplicate_of: string | null; availability_note: string | null; process_number: string | null; procurement_reference: string | null }>(
      `SELECT a.*, g.name manager, g.cnpj manager_cnpj, o.legal_name org, o.cnpj org_cnpj, o.verification_status org_status, s.legal_name supplier, s.cnpj supplier_cnpj, src.name source_name
         FROM price_registration_atas a JOIN ata_sources src ON src.id = a.source_id LEFT JOIN government_entities g ON g.id = a.managing_entity_id
         LEFT JOIN organizations o ON o.id = a.submitted_by_org_id LEFT JOIN suppliers s ON s.id = a.supplier_id WHERE a.id = $1`, [id]);
    if (!a) return null;
    return {
      a,
      items: await tx.many<{ id: string; item_number: number | null; description: string; unit: string | null; quantity: string | null; unit_price: string | null; total_price: string | null; supplier_name: string | null }>(
        "SELECT id, item_number, description, unit, quantity, unit_price, total_price, supplier_name FROM ata_items WHERE ata_id = $1 OR (ata_id IS NULL AND procurement_record_id = $2) ORDER BY item_number LIMIT 300", [id, a.procurement_record_id]),
      docs: await tx.many<{ id: string; title: string; kind: string; visibility: string; external_url: string | null }>("SELECT id, title, kind, visibility, external_url FROM ata_documents WHERE ata_id = $1 OR (ata_id IS NULL AND procurement_record_id = $2)", [id, a.procurement_record_id]),
      extraction: await tx.one<{ method: string; model: string | null; warnings: string[]; result: Record<string, unknown> }>("SELECT method, model, warnings, result FROM ata_extractions WHERE ata_id = $1 ORDER BY created_at DESC LIMIT 1", [id]),
      cats: await tx.many<{ id: string; name: string }>("SELECT id, name FROM categories ORDER BY sort_order"),
      dups: await tx.many<{ id: string; ata_number: string; source: string }>(
        `SELECT b.id, b.ata_number, s.name source FROM price_registration_atas b JOIN ata_sources s ON s.id = b.source_id, price_registration_atas a
          WHERE a.id = $1 AND b.id <> a.id AND b.managing_entity_id = a.managing_entity_id
            AND regexp_replace(lower(b.ata_number),'[^0-9a-z]','','g') = regexp_replace(lower(a.ata_number),'[^0-9a-z]','','g') LIMIT 5`, [id]),
      history: await tx.many<{ from_status: string | null; to_status: string; reason: string | null; created_at: Date; who: string | null }>(
        "SELECT h.from_status, h.to_status, h.reason, h.created_at, u.full_name who FROM ata_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.ata_id = $1 ORDER BY h.created_at DESC", [id]),
    };
  });
  if (!d) notFound();
  const { a } = d;
  return (
    <>
      <PageHeader breadcrumb={<Link href="/admin/atas" className="hover:underline">Atas</Link>} title={`Ata nº ${a.ata_number}`} actions={<><StatusBadge status={a.status} /><OriginBadge origin={a.origin} source={a.source_name} /><Link href={`/atas/${a.id}`} className="text-sm text-brand-700 hover:underline">Página pública</Link></>} />
      {d.dups.length > 0 && (
        <Notice tone="amber" className="mb-4" title="Possíveis duplicidades (mesmo órgão e número)">
          <ul className="mt-1">{d.dups.map((x) => (
            <li key={x.id} className="flex items-center gap-3"><Link className="underline" href={`/admin/atas/${x.id}`}>Ata {x.ata_number} ({x.source})</Link>
              <form action={markDuplicateAction}><input type="hidden" name="ata_id" value={a.id} /><input type="hidden" name="duplicate_of" value={x.id} /><button className="text-xs font-medium underline">Marcar esta como duplicada daquela</button></form></li>))}</ul>
        </Notice>
      )}
      {a.duplicate_of && <Notice tone="red" className="mb-4">Marcada como duplicada (oculta da busca). <form action={markDuplicateAction} className="inline"><input type="hidden" name="ata_id" value={a.id} /><input type="hidden" name="duplicate_of" value="" /><button className="underline">Desfazer</button></form></Notice>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card><CardHeader title="Dados declarados" />
            <div className="space-y-4 p-5">
              <p className="text-sm">{a.object}</p>
              <Dl items={[["Órgão gerenciador", `${a.manager ?? "—"} · ${formatCnpj(a.manager_cnpj)}`], ["Processo / procedimento", [a.process_number, a.procurement_reference].filter(Boolean).join(" · ") || "—"],
                ["Assinatura", dateBR(a.signature_date)], ["Vigência", `${dateBR(a.validity_start)} a ${dateBR(a.validity_end)}`],
                ["Enviada por", a.org ? `${a.org} · ${formatCnpj(a.org_cnpj)} (${a.org_status})` : "—"], ["Fornecedor vinculado", a.supplier ? `${a.supplier} · ${formatCnpj(a.supplier_cnpj)}` : "—"],
                ["Fonte / ID externo", `${a.source_name} · ${a.external_id ?? "—"}`], ["Disponibilidade (fornecedor)", a.availability_note]]} />
              {a.org_cnpj && a.supplier_cnpj && a.org_cnpj !== a.supplier_cnpj && <Notice tone="red">CNPJ da conta difere do fornecedor vinculado.</Notice>}
            </div>
          </Card>
          {d.extraction && (
            <Card><CardHeader title={`Extração automática (${d.extraction.method}${d.extraction.model ? ` · ${d.extraction.model}` : ""})`} description="Compare com o documento antes de verificar." />
              <div className="p-5 text-sm">{d.extraction.warnings?.length ? <ul className="list-disc pl-5 text-amber-800">{d.extraction.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : "Sem alertas."}</div>
            </Card>
          )}
          <Card><CardHeader title={`Itens (${d.items.length})`} />
            <Table><thead><tr><Th>Item</Th><Th>Descrição</Th><Th>Unid.</Th><Th className="text-right">Qtd.</Th><Th className="text-right">Unitário</Th><Th className="text-right">Total</Th><Th>Fornecedor</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{d.items.map((i) => {
                const mismatch = i.quantity && i.unit_price && i.total_price && Math.abs(Number(i.quantity) * Number(i.unit_price) - Number(i.total_price)) > Math.max(0.05, Number(i.total_price) * 0.01);
                return <tr key={i.id} className={mismatch ? "bg-amber-50" : ""}><Td>{i.item_number}</Td><Td>{i.description}</Td><Td>{i.unit}</Td><Td className="text-right tabular">{num(i.quantity)}</Td><Td className="text-right tabular">{brl(i.unit_price)}</Td><Td className="text-right tabular">{brl(i.total_price)}{mismatch && <span className="block text-[10px] text-amber-700">divergente</span>}</Td><Td className="text-xs">{i.supplier_name}</Td></tr>;
              })}</tbody></Table>
          </Card>
          <Card><CardHeader title="Documentos" />
            <ul className="divide-y divide-slate-100 text-sm">{d.docs.map((x) => <li key={x.id} className="px-5 py-2"><a className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer" href={x.external_url ?? `/api/documentos/${x.id}`}>{x.title}</a> <span className="text-xs text-slate-500">· {x.kind} · {x.visibility}</span></li>)}
              {d.docs.length === 0 && <li className="px-5 py-2 text-slate-500">Nenhum documento.</li>}</ul>
          </Card>
          <Card><CardHeader title="Análise de potencial de adesão" description="Registro dos critérios avaliados e ressalvas (exibido publicamente com aviso)." />
            <ActionForm action={assessAtaAction} className="space-y-2 p-5">
              <input type="hidden" name="ata_id" value={a.id} />
              {ADHESION_CHECKLIST.map((c) => (
                <div key={c.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_8rem_12rem]">
                  <span className="text-slate-700">{c.label} <span className="text-xs text-slate-400">({c.reference})</span></span>
                  <select name={`c_${c.id}`} className="h-8 rounded border border-slate-300 text-xs"><option value="">Não avaliado</option><option value="sim">Atendido</option><option value="nao">Não atendido</option></select>
                  <input name={`n_${c.id}`} placeholder="Nota" className="h-8 rounded border border-slate-300 px-2 text-xs" />
                </div>
              ))}
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <Field label="Conclusão"><Select name="conclusion" defaultValue="requer_analise_adicional"><option value="sem_impedimento_aparente">Sem impedimento aparente</option><option value="requer_analise_adicional">Requer análise adicional</option><option value="impedimento_identificado">Impedimento identificado</option></Select></Field>
                <Field label="Ressalvas"><Input name="caveats" /></Field>
              </div>
              <SubmitButton variant="secondary">Registrar análise</SubmitButton>
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Moderação" />
            <ActionForm action={moderateAtaAction} className="space-y-3 p-5 text-sm">
              <input type="hidden" name="ata_id" value={a.id} />
              <Field label="Status"><Select name="status" defaultValue={MODERATION_TARGETS.includes(a.status as AtaStatus) ? a.status : "cadastrada"}>{MODERATION_TARGETS.map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}</Select></Field>
              <label className="flex items-center gap-2"><input type="checkbox" name="documents_verified" defaultChecked={a.documents_verified} />Dados documentais conferidos</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="supplier_confirmed" defaultChecked={a.supplier_confirmed} />Vínculo do fornecedor comprovado</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="validity_confirmed" defaultChecked={a.validity_confirmed} />Vigência confirmada</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="availability_checked" defaultChecked={Boolean(a.availability_checked_at)} />Disponibilidade consultada com o fornecedor</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="featured" defaultChecked={a.featured} />Destaque no marketplace</label>
              <Field label="Categoria"><Select name="category_id" defaultValue={a.category_id ?? ""}><option value="">—</option>{d.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Motivo / justificativa" hint="Obrigatório para rejeição; enviado ao fornecedor."><Textarea name="reason" rows={2} /></Field>
              <Field label="Notas internas de moderação"><Textarea name="moderation_notes" rows={2} defaultValue={a.moderation_notes ?? ""} /></Field>
              <SubmitButton className="w-full">Salvar moderação</SubmitButton>
            </ActionForm>
          </Card>
          <Card><CardHeader title="Histórico de status" />
            <ul className="divide-y divide-slate-100 text-xs">{d.history.map((h, i) => <li key={i} className="px-5 py-2"><p className="text-slate-500">{dateTimeBR(h.created_at)}{h.who ? ` · ${h.who}` : ""}</p><p>{h.from_status ?? "—"} → <strong>{h.to_status}</strong>{h.reason ? `: ${h.reason}` : ""}</p></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}

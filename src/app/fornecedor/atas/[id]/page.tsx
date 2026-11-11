import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ata-bits";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { STATUS_INFO, type AtaStatus } from "@/lib/atas/status";
import { brl, dateTimeBR, num } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";
import { addItemAction, closeAtaAction, deleteDraftAction, deleteItemAction, submitForValidationAction, uploadDocumentAction } from "../../actions";
import { AtaHeaderForm } from "../header-form";

export const metadata = { title: "Editar ata" };

export default async function EditAta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ extraida?: string; criada?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { org } = await requireOrg("supplier");
  const d = await userDb(async (tx) => {
    const a = await tx.one<{ id: string; ata_number: string; year: number | null; process_number: string | null; procurement_reference: string | null; uasg: string | null; object: string; status: string; origin: string; submitted_by_org_id: string | null; state: string | null; city: string | null; signature_date: string | null; validity_start: string | null; validity_end: string | null; source_url: string | null; availability_note: string | null; moderation_notes: string | null; manager_cnpj: string | null; manager_name: string | null; manager_sphere: string | null; managing_unit_name: string | null; views_count: number }>(
      `SELECT a.*, g.cnpj AS manager_cnpj, coalesce(g.name, a.managing_unit_name) AS manager_name, g.sphere AS manager_sphere
         FROM price_registration_atas a LEFT JOIN government_entities g ON g.id = a.managing_entity_id WHERE a.id = $1`, [id]);
    if (!a) return null;
    const items = await tx.many<{ id: string; item_number: number | null; catalog_type: string | null; catalog_code: string | null; description: string; unit: string | null; quantity: string | null; unit_price: string | null; total_price: string | null }>(
      "SELECT id, item_number, catalog_type, catalog_code, description, unit, quantity, unit_price, total_price FROM ata_items WHERE ata_id = $1 ORDER BY item_number NULLS LAST, created_at", [id]);
    const docs = await tx.many<{ id: string; kind: string; title: string; visibility: string; external_url: string | null; created_at: Date }>(
      "SELECT id, kind, title, visibility, external_url, created_at FROM ata_documents WHERE ata_id = $1 ORDER BY created_at", [id]);
    const extraction = await tx.one<{ method: string; model: string | null; warnings: string[]; status: string; created_at: Date }>(
      "SELECT method, model, warnings, status, created_at FROM ata_extractions WHERE ata_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
    const history = await tx.many<{ to_status: string; reason: string | null; created_at: Date }>("SELECT to_status, reason, created_at FROM ata_status_history WHERE ata_id = $1 ORDER BY created_at DESC LIMIT 10", [id]);
    return { a, items, docs, extraction, history };
  });
  if (!d) notFound();
  const { a, items, docs, extraction, history } = d;
  const editable = a.submitted_by_org_id === org.organization_id && a.origin === "fornecedor";
  const draft = ["rascunho", "rejeitada"].includes(a.status);
  const lastReason = history.find((h) => h.to_status === "rejeitada")?.reason;

  return (
    <>
      <PageHeader breadcrumb={<Link href="/fornecedor/atas" className="hover:underline">Minhas atas</Link>} title={`Ata nº ${a.ata_number}`}
        description={STATUS_INFO[a.status as AtaStatus]?.help}
        actions={<><StatusBadge status={a.status} />{STATUS_INFO[a.status as AtaStatus]?.public && <Link href={`/atas/${a.id}`} className="text-sm text-brand-700 hover:underline">Ver página pública</Link>}</>} />
      {sp.criada && <Notice tone="green" className="mb-4">Rascunho criado. Inclua os itens e anexe o documento original.</Notice>}
      {extraction && extraction.status !== "revisada" && (
        <Notice tone="amber" className="mb-4" title={`Dados pré-preenchidos por extração automática (${extraction.method === "llm" ? "IA" : "padrões de texto"}) — revise antes de enviar`}>
          {extraction.warnings?.length ? <ul className="mt-1 list-disc pl-5">{extraction.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p>Nenhum alerta de consistência, mas a conferência humana continua obrigatória.</p>}
        </Notice>
      )}
      {a.status === "rejeitada" && lastReason && <Notice tone="red" className="mb-4" title="Ata não aprovada na moderação">{lastReason}</Notice>}
      {a.moderation_notes && editable && <Notice tone="gray" className="mb-4">{a.moderation_notes}</Notice>}
      {!editable && <Notice className="mb-4">Ata importada de fonte pública vinculada à sua empresa. Correções devem ser feitas na fonte oficial ou solicitadas à moderação.</Notice>}

      <div className="space-y-6">
        <Card><CardHeader title="Identificação" description={a.status === "em_validacao" ? "Em validação: alterações aguardam a moderação." : !draft && editable ? "Alterar número, objeto ou vigência devolve a ata para validação." : undefined} />
          <div className="p-5"><AtaHeaderForm disabled={!editable} a={{ ...a, manager_name: a.manager_name }} /></div>
        </Card>

        <Card><CardHeader title={`Itens (${items.length})`} description="Cadastre cada item registrado com quantidade e preço unitário." />
          {items.length > 0 && (
            <Table><thead><tr><Th>Item</Th><Th>Código</Th><Th>Descrição</Th><Th>Unid.</Th><Th className="text-right">Qtd.</Th><Th className="text-right">Unitário</Th><Th className="text-right">Total</Th><Th></Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{items.map((i) => (
                <tr key={i.id}><Td>{i.item_number ?? "—"}</Td><Td className="text-xs">{i.catalog_code ? `${i.catalog_type ?? ""} ${i.catalog_code}` : "—"}</Td><Td className="min-w-64">{i.description}</Td><Td>{i.unit ?? "—"}</Td>
                  <Td className="text-right tabular">{num(i.quantity)}</Td><Td className="text-right tabular">{brl(i.unit_price)}</Td><Td className="text-right tabular">{brl(i.total_price)}</Td>
                  <Td>{editable && <form action={deleteItemAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="ata_id" value={a.id} /><button className="text-xs text-red-600 hover:underline">Remover</button></form>}</Td></tr>
              ))}</tbody></Table>
          )}
          {editable && (
            <ActionForm action={addItemAction} resetOnSuccess className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-6">
              <input type="hidden" name="ata_id" value={a.id} />
              <Field label="Nº"><Input name="item_number" type="number" min={0} /></Field>
              <Field label="Catálogo"><Select name="catalog_type" defaultValue=""><option value="">—</option><option>CATMAT</option><option>CATSER</option><option value="OUTRO">Outro</option></Select></Field>
              <Field label="Código"><Input name="catalog_code" /></Field>
              <Field label="Unidade"><Input name="unit" placeholder="UN, CX, M²…" /></Field>
              <Field label="Quantidade"><Input name="quantity" inputMode="decimal" /></Field>
              <Field label="Preço unitário (R$)"><Input name="unit_price" inputMode="decimal" placeholder="0,00" /></Field>
              <Field label="Descrição" className="sm:col-span-5"><Input name="description" required /></Field>
              <div className="flex items-end"><SubmitButton variant="secondary" className="w-full">Incluir item</SubmitButton></div>
            </ActionForm>
          )}
        </Card>

        <Card><CardHeader title="Documentos" description="Documento original da ata, edital, termos aditivos. Evidências são sempre privadas." />
          <ul className="divide-y divide-slate-100 text-sm">
            {docs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <a href={doc.external_url ?? `/api/documentos/${doc.id}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{doc.title}</a>
                <span className="flex gap-2"><Badge>{doc.kind}</Badge><Badge tone={doc.visibility === "public" ? "blue" : "gray"}>{doc.visibility === "public" ? "Público após publicação" : "Privado"}</Badge><span className="text-xs text-slate-500">{dateTimeBR(doc.created_at)}</span></span>
              </li>
            ))}
            {docs.length === 0 && <li className="px-5 py-3 text-slate-500">Nenhum documento anexado.</li>}
          </ul>
          {editable && (
            <ActionForm action={uploadDocumentAction} resetOnSuccess className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-4">
              <input type="hidden" name="ata_id" value={a.id} />
              <Field label="Tipo"><Select name="kind" defaultValue="ata"><option value="ata">Ata (documento original)</option><option value="edital">Edital</option><option value="termo_aditivo">Termo aditivo</option><option value="outro">Outro</option><option value="evidencia">Evidência (privado)</option></Select></Field>
              <Field label="Título"><Input name="title" required /></Field>
              <Field label="Visibilidade"><Select name="visibility" defaultValue="public"><option value="public">Público</option><option value="private">Privado</option></Select></Field>
              <Field label="Arquivo (PDF/PNG/JPEG)"><input type="file" name="file" required accept="application/pdf,image/png,image/jpeg" className="block w-full text-sm" /></Field>
              <div><SubmitButton variant="secondary">Anexar</SubmitButton></div>
            </ActionForm>
          )}
        </Card>

        {editable && draft && (
          <Card className="p-5">
            <h2 className="font-semibold text-navy-900">Enviar para validação</h2>
            <p className="mt-1 text-sm text-slate-600">A equipe confere os dados com o documento original. A ata é publicada após aprovação.</p>
            <ActionForm action={submitForValidationAction} className="mt-4 space-y-3">
              <input type="hidden" name="ata_id" value={a.id} />
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="reviewed" className="mt-1" />Revisei todos os dados, inclusive os preenchidos automaticamente, e declaro que correspondem ao documento original.</label>
              <SubmitButton>Enviar para validação</SubmitButton>
            </ActionForm>
            {a.status === "rascunho" && (
              <form action={deleteDraftAction} className="mt-4"><input type="hidden" name="ata_id" value={a.id} /><ConfirmButton message="Excluir este rascunho?">Excluir rascunho</ConfirmButton></form>
            )}
          </Card>
        )}
        {editable && !draft && a.status !== "encerrada" && (
          <form action={closeAtaAction}><input type="hidden" name="ata_id" value={a.id} /><ConfirmButton message="Marcar a ata como encerrada/indisponível?">Informar encerramento ou indisponibilidade</ConfirmButton></form>
        )}
      </div>
    </>
  );
}

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { toDateInput } from "@/lib/format";
import { UFS } from "@/lib/validators";
import { saveAtaAction } from "../actions";

export interface AtaHeader {
  id?: string; ata_number?: string; year?: number | null; process_number?: string | null; procurement_reference?: string | null; uasg?: string | null;
  object?: string; manager_cnpj?: string | null; manager_name?: string | null; manager_sphere?: string | null; state?: string | null; city?: string | null;
  signature_date?: string | null; validity_start?: string | null; validity_end?: string | null; source_url?: string | null; availability_note?: string | null;
}

export function AtaHeaderForm({ a = {}, disabled = false }: { a?: AtaHeader; disabled?: boolean }) {
  return (
    <ActionForm action={saveAtaAction} className="grid gap-4 sm:grid-cols-2">
      {a.id && <input type="hidden" name="ata_id" value={a.id} />}
      <fieldset disabled={disabled} className="contents">
        <Field label="Número da ata" required><Input name="ata_number" defaultValue={a.ata_number} required /></Field>
        <Field label="Ano"><Input name="year" type="number" defaultValue={a.year ?? ""} /></Field>
        <Field label="Processo administrativo"><Input name="process_number" defaultValue={a.process_number ?? ""} /></Field>
        <Field label="Pregão / procedimento de origem"><Input name="procurement_reference" defaultValue={a.procurement_reference ?? ""} placeholder="Pregão Eletrônico nº 00/0000" /></Field>
        <Field label="Objeto" required className="sm:col-span-2"><Textarea name="object" defaultValue={a.object} required rows={3} /></Field>
        <Field label="CNPJ do órgão gerenciador" required><Input name="manager_cnpj" defaultValue={a.manager_cnpj ?? ""} required inputMode="numeric" /></Field>
        <Field label="Esfera do gerenciador" required>
          <Select name="manager_sphere" defaultValue={a.manager_sphere ?? ""} required><option value="" disabled>Selecione</option><option value="federal">Federal</option><option value="estadual">Estadual</option><option value="distrital">Distrital</option><option value="municipal">Municipal</option></Select>
        </Field>
        <Field label="Órgão gerenciador" required className="sm:col-span-2"><Input name="manager_name" defaultValue={a.manager_name ?? ""} required /></Field>
        <Field label="UASG / unidade"><Input name="uasg" defaultValue={a.uasg ?? ""} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="UF" required><Select name="state" defaultValue={a.state ?? ""} required><option value="" disabled>—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <Field label="Município" required className="col-span-2"><Input name="city" defaultValue={a.city ?? ""} required /></Field>
        </div>
        <Field label="Data de assinatura"><Input type="date" name="signature_date" defaultValue={toDateInput(a.signature_date)} /></Field>
        <Field label="Início da vigência"><Input type="date" name="validity_start" defaultValue={toDateInput(a.validity_start)} /></Field>
        <Field label="Fim da vigência" required><Input type="date" name="validity_end" defaultValue={toDateInput(a.validity_end)} /></Field>
        <Field label="Link da fonte oficial" hint="Ex.: página da ata no PNCP ou portal do órgão"><Input name="source_url" type="url" defaultValue={a.source_url ?? ""} /></Field>
        <Field label="Observação sobre disponibilidade comercial" className="sm:col-span-2" hint="Informação do fornecedor; não substitui confirmação de saldo pelo gerenciador."><Input name="availability_note" defaultValue={a.availability_note ?? ""} /></Field>
        <div className="sm:col-span-2"><SubmitButton>{a.id ? "Salvar alterações" : "Criar rascunho"}</SubmitButton></div>
      </fieldset>
    </ActionForm>
  );
}

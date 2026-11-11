import Link from "next/link";
import { StatusBadge, ValidityBadge } from "@/components/ata-bits";
import { UpgradeNotice } from "@/components/gate";
import { Card, Empty, PageHeader, Select } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { ADHESION_CHECKLIST } from "@/lib/atas/compliance";
import { dateBR } from "@/lib/format";
import { createExpiryAlertAction, saveOrgAssessmentAction, updateFavoriteAction } from "../actions";

export const metadata = { title: "Favoritos e oportunidades" };
const STAGES: [string, string][] = [["salva", "Salva"], ["em_analise", "Em análise"], ["consulta_enviada", "Consulta enviada"], ["encaminhada", "Encaminhada ao processo"], ["descartada", "Descartada"]];

export default async function Favorites() {
  const { user, org } = await requireOrg("government");
  const { ent, rows } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    rows: await tx.many<{ id: string; ata_number: string; object: string; status: string; validity_end: string | null; cancelled: boolean; manager: string | null; stage: string; note: string | null; created_at: Date; last_assessment: string | null }>(
      `SELECT a.id, a.ata_number, a.object, a.status, a.validity_end, a.cancelled, g.name AS manager, f.stage, f.note, f.created_at,
              (SELECT conclusion FROM ata_adhesion_assessments s WHERE s.ata_id = a.id AND s.organization_id = $2 ORDER BY created_at DESC LIMIT 1) AS last_assessment
         FROM favorites f JOIN price_registration_atas a ON a.id = f.ata_id LEFT JOIN government_entities g ON g.id = a.managing_entity_id
        WHERE f.user_id = $1 ORDER BY f.created_at DESC`, [user.id, org.organization_id]),
  }));
  if (!has(ent, "favorites")) return <><PageHeader title="Favoritos e oportunidades" /><UpgradeNotice feature="favorites" href="/orgao/licenca" /></>;
  return (
    <>
      <PageHeader title="Favoritos e oportunidades" description="Organize as atas de interesse por etapa e registre a análise preliminar de adesão do seu órgão." />
      {rows.length === 0 ? <Empty title="Nenhuma ata favorita">Use o botão “Favoritar” na página da ata.</Empty> : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2"><StatusBadge status={r.status} /><ValidityBadge end={r.validity_end} cancelled={r.cancelled} status={r.status} /></div>
                  <Link href={`/atas/${r.id}`} className="mt-2 block font-semibold text-navy-900 hover:text-brand-700">Ata {r.ata_number} — {r.manager}</Link>
                  <p className="line-clamp-2 text-sm text-slate-600">{r.object}</p>
                  <p className="mt-1 text-xs text-slate-500">Salva em {dateBR(r.created_at)}{r.last_assessment ? ` · Última análise: ${r.last_assessment.replaceAll("_", " ")}` : ""}</p>
                </div>
                <form action={updateFavoriteAction} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input type="hidden" name="ata_id" value={r.id} />
                  <Select name="stage" defaultValue={r.stage} className="h-9 w-48">{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                  <input name="note" defaultValue={r.note ?? ""} placeholder="Anotação" maxLength={1000} className="h-9 w-56 rounded-lg border border-slate-300 px-2 text-sm" />
                  <button className="h-9 rounded-lg border border-slate-300 px-3 text-sm">Salvar</button>
                </form>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <details className="rounded-lg border border-slate-200 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Registrar análise preliminar de adesão</summary>
                  <form action={saveOrgAssessmentAction} className="mt-3 space-y-2">
                    <input type="hidden" name="ata_id" value={r.id} />
                    {ADHESION_CHECKLIST.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-700">{c.label}</span>
                        <select name={`c_${c.id}`} className="h-8 rounded border border-slate-300 text-xs"><option value="">Pendente</option><option value="sim">Atendido</option><option value="nao">Não atendido</option></select>
                      </div>
                    ))}
                    <select name="conclusion" className="h-9 w-full rounded-lg border border-slate-300 text-sm">
                      <option value="requer_analise_adicional">Requer análise adicional</option>
                      <option value="sem_impedimento_aparente">Sem impedimento aparente</option>
                      <option value="impedimento_identificado">Impedimento identificado</option>
                    </select>
                    <textarea name="caveats" rows={2} placeholder="Ressalvas e observações" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
                    <button className="h-9 rounded-lg bg-navy-800 px-3 text-sm text-white">Registrar análise</button>
                    <p className="text-[11px] text-slate-500">Registro interno do órgão; não substitui parecer jurídico.</p>
                  </form>
                </details>
                {has(ent, "alerts") && (
                  <form action={createExpiryAlertAction} className="flex flex-wrap items-center gap-2 self-start rounded-lg border border-slate-200 p-3 text-sm">
                    <input type="hidden" name="ata_id" value={r.id} />
                    <span>Avisar</span><input name="days_before" type="number" min={1} max={365} defaultValue={30} className="h-8 w-16 rounded border border-slate-300 px-2" /><span>dias antes do vencimento</span>
                    <button className="h-8 rounded-lg border border-slate-300 px-3">Criar alerta</button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

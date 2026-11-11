import Link from "next/link";
import { StatusBadge, ValidityBadge } from "@/components/ata-bits";
import { UpgradeNotice } from "@/components/gate";
import { Card, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { searchAtas } from "@/lib/atas/search";
import { SPHERE_LABEL } from "@/lib/atas/status";
import { brl, dateBR, formatCnpj, num } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";
import { ClearCompare } from "./clear";

export const metadata = { title: "Comparador de atas" };

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string; q?: string }> }) {
  const { org } = await requireOrg("government");
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").filter((x) => uuidSchema.safeParse(x).success).slice(0, 5);
  const { ent, rows } = await userDb(async (tx) => {
    const ent = await getEntitlements(tx, org.organization_id);
    if (!has(ent, "compare") || !ids.length) return { ent, rows: [] };
    const r = await searchAtas(tx, { q: sp.q, somenteVigentes: "0" }, { ids, pageSize: 5 });
    const fallback = sp.q && r.rows.length < ids.length ? (await searchAtas(tx, { somenteVigentes: "0" }, { ids, pageSize: 5 })).rows : r.rows;
    return { ent, rows: fallback };
  });
  if (!has(ent, "compare")) return <><PageHeader title="Comparador de atas" /><UpgradeNotice feature="compare" href="/orgao/licenca" /></>;
  const lines: [string, (r: (typeof rows)[number]) => React.ReactNode][] = [
    ["Situação", (r) => <div className="flex flex-col gap-1"><StatusBadge status={r.status} /><ValidityBadge end={r.validity_end} cancelled={r.cancelled} status={r.status} /></div>],
    ["Objeto", (r) => <span className="line-clamp-4">{r.object}</span>],
    ["Item de referência", (r) => r.item_description ?? "—"],
    ["Preço unitário", (r) => <strong className="tabular">{brl(r.item_unit_price)}{r.item_unit ? ` / ${r.item_unit.toLowerCase()}` : ""}</strong>],
    ["Quantidade registrada", (r) => <span className="tabular">{num(r.item_quantity)}</span>],
    ["Fornecedor", (r) => <>{r.supplier_name ?? r.item_supplier_name ?? "Não confirmado"}<span className="block text-xs text-slate-500">{formatCnpj(r.supplier_cnpj ?? r.item_supplier_ni)}</span></>],
    ["Vigência", (r) => `${dateBR(r.validity_start)} a ${dateBR(r.validity_end)}`],
    ["Órgão gerenciador", (r) => <>{r.manager_name}<span className="block text-xs text-slate-500">{SPHERE_LABEL[r.manager_sphere ?? ""] ?? ""}</span></>],
    ["Localização", (r) => (r.city ? `${r.city}/${r.state}` : r.state ?? "—")],
    ["Situação documental", (r) => (r.original_document_url ? "Documento original disponível" : "Documento não localizado")],
    ["Fonte oficial", (r) => (r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{r.source_name}</a> : r.source_name)],
  ];
  return (
    <>
      <PageHeader title="Comparador de atas" description="Compare até 5 atas lado a lado. Selecione atas na busca com a opção “Comparar”."
        actions={rows.length ? <><LinkButton variant="secondary" href={`/api/orgao/comparar?ids=${ids.join(",")}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}>Exportar CSV</LinkButton><ClearCompare /></> : null} />
      <form className="mb-4 flex gap-2" method="get">
        <input type="hidden" name="ids" value={ids.join(",")} />
        <input name="q" defaultValue={sp.q} placeholder="Item a comparar (ex.: notebook i5)" className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        <button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Destacar item</button>
      </form>
      <Notice tone="amber" className="mb-4">O menor preço não representa automaticamente a melhor contratação. Considere especificações técnicas, quantitativos, condições de entrega, vigência, regras da ata e a pesquisa de preços exigida (art. 23 da Lei 14.133/2021).</Notice>
      {rows.length === 0 ? <Empty title="Nenhuma ata selecionada" action={<LinkButton href="/atas">Ir para a busca</LinkButton>} /> : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="bg-slate-50"><th className="w-44 px-4 py-3 text-left text-xs uppercase text-slate-500">Critério</th>
              {rows.map((r) => <th key={r.id} className="min-w-56 px-4 py-3 text-left"><Link href={`/atas/${r.id}`} className="text-brand-700 hover:underline">Ata {r.ata_number}</Link></th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map(([label, fn]) => <tr key={label}><td className="px-4 py-3 text-xs font-medium uppercase text-slate-500">{label}</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 align-top text-slate-800">{fn(r)}</td>)}</tr>)}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

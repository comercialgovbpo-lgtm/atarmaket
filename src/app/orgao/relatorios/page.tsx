import Link from "next/link";
import { UpgradeNotice } from "@/components/gate";
import { Card, CardHeader, Empty, Field, Input, LinkButton, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { priceReport } from "@/lib/atas/reports";
import { brl, dateBR, num } from "@/lib/format";
import { UFS } from "@/lib/validators";

export const metadata = { title: "Relatórios" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ q?: string; uf?: string; vigentes?: string; unidade?: string }> }) {
  const { org } = await requireOrg("government");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const uf = UFS.includes(sp.uf as (typeof UFS)[number]) ? sp.uf : undefined;
  const { ent, rep } = await userDb(async (tx) => {
    const ent = await getEntitlements(tx, org.organization_id);
    return { ent, rep: has(ent, "reports") && q.length >= 3 ? await priceReport(tx, { q, uf, onlyActive: sp.vigentes !== "0" }) : null };
  });
  if (!has(ent, "reports")) return <><PageHeader title="Relatórios" /><UpgradeNotice feature="reports" href="/orgao/licenca" /></>;
  const unit = sp.unidade?.toUpperCase();
  const rows = rep?.rows.filter((r) => !unit || (r.unit ?? "NÃO INFORMADA").trim().toUpperCase() === unit) ?? [];
  const qs = new URLSearchParams({ q, ...(uf ? { uf } : {}), ...(sp.vigentes === "0" ? { vigentes: "0" } : {}), ...(unit ? { unidade: unit } : {}) }).toString();
  return (
    <>
      <PageHeader title="Referência de preços em atas" description="Estatísticas dos preços registrados em atas públicas para apoiar a pesquisa de preços do processo."
        actions={rep && rep.rows.length > 0 && <LinkButton variant="secondary" href={`/api/orgao/relatorio-precos?${qs}`}>Exportar CSV</LinkButton>} />
      <Card className="mb-4 p-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_8rem_12rem_auto] sm:items-end">
          <Field label="Produto ou serviço"><Input name="q" defaultValue={q} required minLength={3} placeholder="Ex.: dipirona 500 mg, papel A4, notebook" /></Field>
          <Field label="UF"><Select name="uf" defaultValue={uf ?? ""}><option value="">Brasil</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <Field label="Atas"><Select name="vigentes" defaultValue={sp.vigentes ?? "1"}><option value="1">Somente vigentes</option><option value="0">Incluir encerradas</option></Select></Field>
          <button className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">Gerar</button>
        </form>
      </Card>
      <Notice tone="amber" className="mb-4">
        Uso como fonte complementar (Lei 14.133/2021, art. 23, §1º, II — contratações similares). Confira especificação, unidade, quantidade, data e
        condições de cada registro, descarte valores inexequíveis ou excessivos e documente a metodologia no processo. Os valores não indicam saldo nem vantajosidade.
      </Notice>
      {!rep ? <Empty title="Informe um produto ou serviço">Digite pelo menos 3 caracteres.</Empty> : rep.stats.length === 0 ? <Empty title="Nenhum preço registrado encontrado">Tente termos mais gerais ou inclua atas encerradas.</Empty> : (
        <>
          <Card className="mb-6"><CardHeader title="Estatísticas por unidade de fornecimento" description="Clique na unidade para filtrar os registros." />
            <Table><thead><tr><Th>Unidade</Th><Th className="text-right">Registros</Th><Th className="text-right">Atas</Th><Th className="text-right">Mínimo</Th><Th className="text-right">1º quartil</Th><Th className="text-right">Mediana</Th><Th className="text-right">3º quartil</Th><Th className="text-right">Máximo</Th><Th className="text-right">Média</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{rep.stats.map((s) => (
                <tr key={s.unit} className={unit === s.unit ? "bg-brand-50" : ""}>
                  <Td><Link className="text-brand-700 hover:underline" href={`/orgao/relatorios?${new URLSearchParams({ q, ...(uf ? { uf } : {}), unidade: s.unit })}`}>{s.unit}</Link></Td>
                  <Td className="text-right tabular">{s.n}</Td><Td className="text-right tabular">{s.atas}</Td>
                  {[s.min, s.p25, s.median, s.p75, s.max, s.mean].map((v, i) => <Td key={i} className={`text-right tabular ${i === 2 ? "font-semibold text-slate-900" : ""}`}>{brl(v)}</Td>)}
                </tr>))}</tbody></Table>
          </Card>
          <Card><CardHeader title={`Registros (${rows.length}${rep.rows.length >= 500 ? "+, amostra limitada" : ""})`} description="Ordenados do menor para o maior preço unitário." />
            <Table><thead><tr><Th>Item</Th><Th>Unid.</Th><Th className="text-right">Preço unitário</Th><Th className="text-right">Qtd. registrada</Th><Th>Ata / órgão</Th><Th>Local</Th><Th>Vigência</Th><Th>Fornecedor</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.slice(0, 200).map((r, i) => (
                <tr key={i}><Td className="min-w-64"><span className="line-clamp-3" title={r.description}>{r.description}</span></Td><Td className="text-xs">{r.unit}</Td><Td className="text-right tabular font-medium">{brl(r.unit_price)}</Td><Td className="text-right tabular">{num(r.quantity)}</Td>
                  <Td className="min-w-48"><Link className="text-brand-700 hover:underline" href={`/atas/${r.ata_id}`}>Ata {r.ata_number}</Link><span className="block text-xs text-slate-500">{r.manager}</span></Td>
                  <Td className="text-xs">{r.city ? `${r.city}/${r.state}` : r.state}</Td><Td className="text-xs">{dateBR(r.validity_end)}</Td><Td className="text-xs">{r.supplier_name}</Td></tr>))}</tbody></Table>
          </Card>
        </>
      )}
    </>
  );
}

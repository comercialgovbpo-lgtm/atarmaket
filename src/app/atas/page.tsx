import Link from "next/link";
import { AtaResultCard } from "@/components/ata-bits";
import { CompareBar, CompareToggle } from "@/components/compare";
import { SearchBar } from "@/components/search-bar";
import { Card, Empty, Field, Input, LinkButton, Pagination, Select } from "@/components/ui";
import { getCurrentUser, userDb } from "@/lib/auth/session";
import { parseSearch, searchAtas, searchToQueryString, type SearchParams } from "@/lib/atas/search";
import { STATUS_INFO, PUBLIC_STATUSES } from "@/lib/atas/status";
import { UFS } from "@/lib/validators";
import { saveSearchAction } from "@/app/orgao/actions";

export const metadata = { title: "Buscar atas de registro de preços" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = parseSearch(await searchParams);
  const user = await getCurrentUser();
  const isGov = user?.activeOrg?.kind === "government";
  const { result, categories } = await userDb(async (tx) => {
    const result = await searchAtas(tx, sp);
    const hasQuery = Object.keys(sp).some((k) => k !== "pagina" && k !== "ordem");
    if (hasQuery && (sp.pagina ?? 1) === 1)
      await tx.exec("INSERT INTO search_logs(user_id, organization_id, query, results_count) VALUES ($1,$2,$3,$4)",
        [user?.id ?? null, user?.activeOrg?.organization_id ?? null, JSON.stringify(sp), result.total]);
    const categories = await tx.many<{ slug: string; name: string }>("SELECT slug, name FROM categories WHERE active ORDER BY sort_order");
    return { result, categories };
  });
  const qs = (o: Record<string, string | number | undefined>) => `/atas?${searchToQueryString(sp, o)}`;
  const statusSel = (sp.status ?? "").split(",").filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SearchBar q={sp.q} uf={sp.uf} />
      <div className="mt-8 lg:flex lg:gap-8">
        <aside className="lg:w-72 lg:shrink-0">
          <Card className="p-5">
            <form action="/atas" method="get" className="space-y-4">
              <input type="hidden" name="q" value={sp.q ?? ""} />
              <p className="text-sm font-semibold text-slate-900">Filtros</p>
              <Field label="Código CATMAT / CATSER"><Input name="catalogo" defaultValue={sp.catalogo} inputMode="numeric" /></Field>
              <Field label="CNPJ do fornecedor"><Input name="cnpj" defaultValue={sp.cnpj} inputMode="numeric" /></Field>
              <Field label="Nome da empresa"><Input name="fornecedor" defaultValue={sp.fornecedor} /></Field>
              <Field label="Órgão gerenciador" hint="Nome ou CNPJ"><Input name="orgao" defaultValue={sp.orgao} /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="UF"><Select name="uf" defaultValue={sp.uf ?? ""}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
                <Field label="Município" className="col-span-2"><Input name="municipio" defaultValue={sp.municipio} /></Field>
              </div>
              <Field label="Categoria">
                <Select name="categoria" defaultValue={sp.categoria ?? ""}><option value="">Todas</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Preço mín. (R$)"><Input name="precoMin" defaultValue={sp.precoMin} inputMode="decimal" /></Field>
                <Field label="Preço máx. (R$)"><Input name="precoMax" defaultValue={sp.precoMax} inputMode="decimal" /></Field>
              </div>
              <Field label="Vigente pelo menos até"><Input type="date" name="vigenteAte" defaultValue={sp.vigenteAte} /></Field>
              <Field label="Situação de vigência">
                <Select name="somenteVigentes" defaultValue={sp.somenteVigentes ?? "1"}><option value="1">Somente vigentes</option><option value="0">Incluir encerradas</option></Select>
              </Field>
              <Field label="Origem">
                <Select name="origem" defaultValue={sp.origem ?? ""}><option value="">Todas</option><option value="fonte_publica">Fonte pública (PNCP)</option><option value="fornecedor">Cadastrada por fornecedor</option></Select>
              </Field>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-slate-700">Status de validação</legend>
                <div className="space-y-1">
                  {PUBLIC_STATUSES.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700" title={STATUS_INFO[s].help}>
                      <input type="checkbox" name="status" value={s} defaultChecked={statusSel.includes(s)} />{STATUS_INFO[s].label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex gap-2 pt-2">
                <button className="h-10 flex-1 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700">Aplicar</button>
                <LinkButton href={sp.q ? `/atas?q=${encodeURIComponent(sp.q)}` : "/atas"} variant="secondary">Limpar</LinkButton>
              </div>
            </form>
          </Card>
        </aside>

        <section className="mt-6 min-w-0 flex-1 lg:mt-0" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{result.total.toLocaleString("pt-BR")}</strong> ata(s) encontrada(s){sp.q ? <> para “{sp.q}”</> : null}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-slate-500">Ordenar:</span>
              {([["relevancia", "Relevância"], ["recentes", "Recentes"], ["vencimento", "Vencimento"], ["preco", "Menor preço"]] as const).map(([k, l]) => (
                <Link key={k} href={qs({ ordem: k, pagina: undefined })} className={(sp.ordem ?? "relevancia") === k ? "font-semibold text-navy-900" : "text-brand-700 hover:underline"}>{l}</Link>
              ))}
            </div>
          </div>
          {isGov && <SaveSearch sp={sp} />}
          {sp.ordem === "preco" && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              A ordenação por preço é apenas informativa: o menor preço não representa automaticamente a contratação mais vantajosa.
              Avalie especificações, quantitativos, logística, vigência e regras da ata.
            </p>
          )}
          <div className="mt-4 space-y-4">
            {result.rows.length === 0 ? (
              <Empty title="Nenhuma ata encontrada">Ajuste os filtros ou tente termos mais gerais. Inclua atas encerradas para ver o histórico de preços.</Empty>
            ) : (
              result.rows.map((r) => <AtaResultCard key={r.id} r={r} compareSlot={<CompareToggle id={r.id} />} />)
            )}
          </div>
          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} href={(p) => qs({ pagina: p })} />
        </section>
      </div>
      <CompareBar />
    </div>
  );
}

function SaveSearch({ sp }: { sp: SearchParams }) {
  return (
    <form action={saveSearchAction} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <input type="hidden" name="query" value={JSON.stringify({ ...sp, pagina: undefined })} />
      <input name="name" required maxLength={80} placeholder="Nome da pesquisa (ex.: Notebooks SP)" className="h-8 flex-1 rounded-md border border-slate-300 px-2 text-sm" />
      <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="alert" /> Avisar sobre novas atas</label>
      <button className="h-8 rounded-md bg-navy-800 px-3 text-xs font-medium text-white">Salvar pesquisa</button>
    </form>
  );
}

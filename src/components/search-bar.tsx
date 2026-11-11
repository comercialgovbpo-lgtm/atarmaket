import { Search } from "lucide-react";
import { UFS } from "@/lib/validators";

export function SearchBar({ q, uf, big = false }: { q?: string; uf?: string; big?: boolean }) {
  return (
    <form action="/atas" method="get" role="search" className={`flex w-full flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200 sm:flex-row ${big ? "sm:p-2.5" : ""}`}>
      <label className="flex flex-1 items-center gap-3 px-3">
        <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
        <span className="sr-only">O que você precisa comprar?</span>
        <input name="q" defaultValue={q} placeholder="O que você precisa comprar? Ex.: notebook, medicamento, pavimentação, CATMAT…"
          className={`w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none ${big ? "h-12 text-base" : "h-10 text-sm"}`} />
      </label>
      <select name="uf" defaultValue={uf ?? ""} aria-label="Estado" className="h-12 rounded-xl border-0 bg-slate-50 px-3 text-sm text-slate-700 sm:w-32">
        <option value="">Todo o Brasil</option>
        {UFS.map((u) => <option key={u}>{u}</option>)}
      </select>
      <button className={`rounded-xl bg-brand-600 px-6 font-medium text-white hover:bg-brand-700 ${big ? "h-12" : "h-10"}`}>Buscar atas</button>
    </form>
  );
}

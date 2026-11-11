"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "am_compare";
const MAX = 5;
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]").slice(0, MAX); } catch { return []; } };
const write = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch {} window.dispatchEvent(new Event("am-compare")); };

function useCompare() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(read());
    sync();
    window.addEventListener("am-compare", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("am-compare", sync); window.removeEventListener("storage", sync); };
  }, []);
  return ids;
}

export function CompareToggle({ id }: { id: string }) {
  const ids = useCompare();
  const on = ids.includes(id);
  const full = !on && ids.length >= MAX;
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${full ? "text-slate-400" : "text-slate-700"}`} title={full ? "Limite de 5 atas no comparador" : undefined}>
      <input type="checkbox" checked={on} disabled={full} onChange={() => write(on ? ids.filter((x) => x !== id) : [...ids, id])} />
      Comparar
    </label>
  );
}

export function CompareBar() {
  const ids = useCompare();
  if (!ids.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-3 rounded-xl bg-navy-900 px-4 py-3 text-sm text-white shadow-xl">
      <span>{ids.length} de {MAX} ata(s) selecionada(s)</span>
      <div className="flex items-center gap-3">
        <button className="text-slate-300 hover:text-white" onClick={() => write([])}>Limpar</button>
        <Link href={`/orgao/comparar?ids=${ids.join(",")}`} className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium hover:bg-brand-500">Comparar</Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Info, ShieldAlert } from "lucide-react";
import { STATUS_INFO, ataLabel, validityState, type AtaStatus } from "@/lib/atas/status";
import { LEGAL_NOTICE } from "@/lib/atas/compliance";
import { brl, dateBR, formatCnpj, num } from "@/lib/format";
import type { SearchResult } from "@/lib/atas/search";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_INFO[status as AtaStatus];
  if (!s) return <Badge>{status}</Badge>;
  return <Badge tone={s.tone} title={s.help}>{s.label}</Badge>;
}

export function ValidityBadge({ end, cancelled, status }: { end: string | null; cancelled: boolean; status: string }) {
  const v = validityState(end, cancelled, status);
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function OriginBadge({ origin, source }: { origin: string; source?: string }) {
  return origin === "fornecedor"
    ? <Badge tone="navy">Cadastrada por fornecedor</Badge>
    : <Badge tone="gray" title={source}>Fonte pública{source?.startsWith("PNCP") ? " · PNCP" : ""}</Badge>;
}

export function LegalNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div role="note" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className={compact ? "text-xs" : ""}><strong>Aviso jurídico:</strong> {LEGAL_NOTICE}</p>
    </div>
  );
}

export function DataNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-xs text-slate-500"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{children}</p>
  );
}

export function AtaResultCard({ r, compareSlot }: { r: SearchResult; compareSlot?: React.ReactNode }) {
  const supplier = r.supplier_name ?? r.item_supplier_name;
  const supplierDoc = r.supplier_cnpj ?? r.item_supplier_ni;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        <ValidityBadge end={r.validity_end} cancelled={r.cancelled} status={r.status} />
        <OriginBadge origin={r.origin} source={r.source_name} />
        {r.category_name && <span className="text-xs text-slate-500">{r.category_name}</span>}
      </div>
      <h3 className="mt-3 text-base font-semibold text-navy-900">
        <Link href={`/atas/${r.id}`} className="hover:text-brand-700">Ata nº {ataLabel(r.ata_number, r.year)} — {r.manager_name ?? "Órgão não identificado"}</Link>
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.object}</p>

      {r.item_description && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
          <p className="line-clamp-2 font-medium text-slate-800">{r.item_description}</p>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-slate-600">
            <span>Preço registrado: <strong className="tabular text-slate-900">{brl(r.item_unit_price)}</strong>{r.item_unit ? ` / ${r.item_unit.toLowerCase()}` : ""}</span>
            <span>Qtd. registrada: <span className="tabular">{num(r.item_quantity)}</span></span>
            {r.item_catalog && <span>Código: {r.item_catalog}</span>}
            {r.items_count > 1 && <span className="text-slate-500">+{r.items_count - 1} item(ns)</span>}
          </div>
        </div>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Fornecedor</dt><dd className="truncate text-slate-800">{supplier ?? <span className="text-slate-400">Não confirmado</span>}</dd></div>
        <div><dt className="text-xs text-slate-500">CNPJ</dt><dd className="tabular text-slate-800">{supplierDoc ? formatCnpj(supplierDoc) : "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Vigência</dt><dd className="tabular text-slate-800">{dateBR(r.validity_start)} a {dateBR(r.validity_end)}</dd></div>
        <div><dt className="text-xs text-slate-500">Local</dt><dd className="text-slate-800">{r.city ? `${r.city}/${r.state}` : r.state ?? "—"}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={`/atas/${r.id}`} className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Ver detalhes</Link>
        {(r.original_document_url || r.source_url) && (
          <a href={r.original_document_url ?? r.source_url!} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-medium text-brand-700 hover:underline">
            {r.original_document_url ? "Documento original" : "Fonte oficial"} ↗
          </a>
        )}
        {compareSlot}
      </div>
    </article>
  );
}

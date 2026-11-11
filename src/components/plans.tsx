import { Check } from "lucide-react";
import { brl } from "@/lib/format";
import { Card, cn } from "./ui";

export interface PlanRow { id: string; code: string; name: string; description: string | null; price_cents: number; billing_interval: string; highlights: string[]; ata_limit: number | null; user_limit: number | null }

export function PlanCards({ plans, current, action, cta = "Contratar", highlight }: { plans: PlanRow[]; current?: string | null; action?: (fd: FormData) => Promise<void>; cta?: string; highlight?: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((p) => (
        <Card key={p.id} className={cn("flex flex-col p-6", highlight === p.code && "border-brand-500 ring-2 ring-brand-100")}>
          <p className="text-sm font-semibold text-brand-700">{p.name}</p>
          <p className="mt-2 text-3xl font-semibold tabular text-navy-900">{brl(p.price_cents / 100, 0)}<span className="text-sm font-normal text-slate-500">/{p.billing_interval === "year" ? "ano" : "mês"}</span></p>
          {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
          <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
            {p.highlights.map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok-600" aria-hidden />{h}</li>)}
          </ul>
          {action && (
            current === p.code ? <p className="mt-6 rounded-lg bg-ok-50 py-2 text-center text-sm font-medium text-ok-700">Plano atual</p> : (
              <form action={action} className="mt-6"><input type="hidden" name="plan_id" value={p.id} />
                <button className="h-10 w-full rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700">{cta}</button></form>
            )
          )}
        </Card>
      ))}
    </div>
  );
}

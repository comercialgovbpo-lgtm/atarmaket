import Link from "next/link";
import { UpgradeNotice } from "@/components/gate";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { OPPORTUNITY_STATUS } from "@/lib/atas/status";
import { brl, dateBR } from "@/lib/format";

export const metadata = { title: "Oportunidades" };

export default async function Pipeline() {
  const { org } = await requireOrg("supplier");
  const { ent, rows } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    rows: await tx.many<{ id: string; title: string; government_name: string; status: string; estimated_value: string | null; next_action_at: string | null; updated_at: Date }>(
      "SELECT id, title, government_name, status, estimated_value, next_action_at, updated_at FROM commercial_opportunities WHERE supplier_org_id = $1 ORDER BY updated_at DESC", [org.organization_id]),
  }));
  if (!has(ent, "crm")) return <><PageHeader title="Oportunidades (CRM)" /><UpgradeNotice feature="crm" href="/fornecedor/assinatura" /></>;
  const cols = Object.entries(OPPORTUNITY_STATUS);
  return (
    <>
      <PageHeader title="Oportunidades (CRM)" description="Acompanhe cada órgão interessado da primeira conversa à conversão." actions={<LinkButton href="/fornecedor/oportunidades/nova">Nova oportunidade</LinkButton>} />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {cols.map(([k, label]) => {
          const list = rows.filter((r) => r.status === k);
          return (
            <section key={k} className="w-64 shrink-0">
              <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">{label}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{list.length}</span></h2>
              <div className="space-y-2">
                {list.map((o) => (
                  <Link key={o.id} href={`/fornecedor/oportunidades/${o.id}`} className="block">
                    <Card className="p-3 text-sm hover:border-brand-500">
                      <p className="font-medium text-slate-900">{o.government_name}</p>
                      <p className="line-clamp-2 text-xs text-slate-600">{o.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{o.estimated_value ? brl(o.estimated_value) + " · " : ""}{o.next_action_at ? `Próx. ação ${dateBR(o.next_action_at)}` : `Atualizada ${dateBR(o.updated_at)}`}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

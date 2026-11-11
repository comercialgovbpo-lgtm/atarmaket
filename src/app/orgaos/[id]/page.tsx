import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AtaResultCard } from "@/components/ata-bits";
import { Badge, Card, Dl, PageHeader, Pagination } from "@/components/ui";
import { anonDb } from "@/lib/db";
import { searchAtas } from "@/lib/atas/search";
import { SPHERE_LABEL } from "@/lib/atas/status";
import { formatCnpj } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string; encerradas?: string }> };

async function load(id: string) {
  return anonDb((tx) => tx.one<{ id: string; cnpj: string; name: string; sphere: string | null; power: string | null; state: string | null; city: string | null; total: number; vigentes: number }>(
    `SELECT g.*, (SELECT count(*)::int FROM price_registration_atas a WHERE a.managing_entity_id = g.id AND ata_status_is_public(a.status)) total,
            (SELECT count(*)::int FROM price_registration_atas a WHERE a.managing_entity_id = g.id AND ata_status_is_public(a.status) AND a.status <> 'encerrada' AND (a.validity_end IS NULL OR a.validity_end >= current_date)) vigentes
       FROM government_entities g WHERE g.id = $1`, [id]));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return {};
  const g = await load(id);
  return g ? { title: `Atas de ${g.name}` } : {};
}

export default async function ManagerPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const g = await load(id);
  if (!g) notFound();
  const page = Math.max(1, Number(sp.pagina) || 1);
  const atas = await anonDb((tx) => searchAtas(tx, { orgao: g.cnpj, somenteVigentes: sp.encerradas ? "0" : "1", ordem: "vencimento", pagina: page }));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader title={g.name} description="Órgão gerenciador" actions={g.sphere && <Badge tone="navy">{SPHERE_LABEL[g.sphere]}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="h-fit p-5">
          <Dl cols={1} items={[["CNPJ", formatCnpj(g.cnpj)], ["Localização", g.city ? `${g.city}/${g.state}` : g.state], ["Atas publicadas", String(g.total)], ["Atas vigentes", String(g.vigentes)]]} />
          <a href={sp.encerradas ? `/orgaos/${g.id}` : `/orgaos/${g.id}?encerradas=1`} className="mt-4 inline-block text-sm text-brand-700 hover:underline">{sp.encerradas ? "Mostrar só vigentes" : "Incluir atas encerradas"}</a>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {atas.rows.map((r) => <AtaResultCard key={r.id} r={r} />)}
          {atas.rows.length === 0 && <p className="text-sm text-slate-500">Nenhuma ata {sp.encerradas ? "" : "vigente "}publicada.</p>}
          <Pagination page={atas.page} total={atas.total} pageSize={atas.pageSize} href={(p) => `/orgaos/${g.id}?pagina=${p}${sp.encerradas ? "&encerradas=1" : ""}`} />
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { AtaResultCard } from "@/components/ata-bits";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
import { anonDb } from "@/lib/db";
import { searchAtas } from "@/lib/atas/search";
import { formatCnpj } from "@/lib/format";
import { uuidSchema } from "@/lib/validators";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await anonDb(async (tx) => {
    const s = await tx.one<{ id: string; cnpj: string; legal_name: string; trade_name: string | null; city: string | null; state: string | null; company_size: string | null; profile_description: string | null; website: string | null; public_email: string | null; public_phone: string | null; account_linked: boolean }>(
      "SELECT * FROM public_suppliers WHERE id = $1", [id]);
    if (!s) return null;
    const atas = await searchAtas(tx, { cnpj: s.cnpj, somenteVigentes: "0", ordem: "vencimento" }, { pageSize: 30 });
    return { s, atas };
  });
  if (!d) notFound();
  const { s, atas } = d;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader title={s.trade_name ?? s.legal_name} description={s.trade_name ? s.legal_name : undefined}
        actions={s.account_linked ? <Badge tone="green">Empresa com conta verificada</Badge> : <Badge>Perfil gerado a partir de dados públicos</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit p-5">
          <Dl cols={1} items={[["CNPJ", formatCnpj(s.cnpj)], ["Localização", s.city ? `${s.city}/${s.state}` : "—"], ["Porte", s.company_size], ["Site", s.website ? <a href={s.website} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">{s.website}</a> : null],
            ["Contato", s.public_email || s.public_phone ? [s.public_email, s.public_phone].filter(Boolean).join(" · ") : "Contato via solicitação na página da ata"]]} />
          {s.profile_description && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{s.profile_description}</p>}
        </Card>
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-navy-900">Atas com participação do fornecedor ({atas.total})</h2>
          {atas.rows.map((r) => <AtaResultCard key={r.id} r={r} />)}
        </div>
      </div>
    </div>
  );
}

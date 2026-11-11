import Link from "next/link";
import { UpgradeNotice } from "@/components/gate";
import { Badge, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireOrg, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { dateTimeBR } from "@/lib/format";
import { toggleAlertAction } from "../actions";

export const metadata = { title: "Alertas" };

export default async function Alerts() {
  const { user, org } = await requireOrg("government");
  const { ent, rows } = await userDb(async (tx) => ({
    ent: await getEntitlements(tx, org.organization_id),
    rows: await tx.many<{ id: string; kind: string; active: boolean; days_before: number; last_triggered_at: Date | null; search_name: string | null; ata_id: string | null; ata_number: string | null }>(
      `SELECT al.id, al.kind, al.active, al.days_before, al.last_triggered_at, s.name AS search_name, a.id AS ata_id, a.ata_number
         FROM alerts al LEFT JOIN saved_searches s ON s.id = al.saved_search_id LEFT JOIN price_registration_atas a ON a.id = al.ata_id
        WHERE al.user_id = $1 ORDER BY al.created_at DESC`, [user.id]),
  }));
  if (!has(ent, "alerts")) return <><PageHeader title="Alertas" /><UpgradeNotice feature="alerts" href="/orgao/licenca" /></>;
  return (
    <>
      <PageHeader title="Alertas" description="Avisos de novas atas para pesquisas salvas e de vencimento de atas acompanhadas. Entregues em Notificações (e por e-mail, quando configurado)." />
      {rows.length === 0 ? <Empty title="Nenhum alerta">Crie alertas ao salvar uma pesquisa ou a partir dos favoritos.</Empty> : (
        <Card><Table><thead><tr><Th>Tipo</Th><Th>Referência</Th><Th>Situação</Th><Th>Último disparo</Th><Th></Th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => (
            <tr key={r.id}>
              <Td>{r.kind === "novas_atas_pesquisa" ? "Novas atas na pesquisa" : `Vencimento (${r.days_before} dias antes)`}</Td>
              <Td>{r.ata_id ? <Link className="text-brand-700 hover:underline" href={`/atas/${r.ata_id}`}>Ata {r.ata_number}</Link> : r.search_name}</Td>
              <Td>{r.active ? <Badge tone="green">Ativo</Badge> : <Badge>Pausado</Badge>}</Td>
              <Td>{dateTimeBR(r.last_triggered_at)}</Td>
              <Td className="whitespace-nowrap text-right">
                <form action={toggleAlertAction} className="inline"><input type="hidden" name="id" value={r.id} /><button className="text-xs text-brand-700 hover:underline">{r.active ? "Pausar" : "Ativar"}</button></form>
                <form action={toggleAlertAction} className="ml-3 inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="delete" /><button className="text-xs text-red-600 hover:underline">Excluir</button></form>
              </Td>
            </tr>))}</tbody></Table></Card>
      )}
    </>
  );
}

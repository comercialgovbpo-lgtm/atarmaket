import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser, userDb } from "@/lib/auth/session";
import { dateTimeBR } from "@/lib/format";
import { markNotificationsReadAction } from "@/app/conta/actions";

export const metadata = { title: "Notificações" };

export default async function Notifications() {
  const user = await requireUser("/notificacoes");
  const rows = await userDb((tx) => tx.many<{ id: string; title: string; body: string | null; link: string | null; read_at: Date | null; created_at: Date }>(
    "SELECT id, title, body, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [user.id]));
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Notificações" actions={rows.some((r) => !r.read_at) && <form action={markNotificationsReadAction}><button className="text-sm text-brand-700 hover:underline">Marcar todas como lidas</button></form>} />
      {rows.length === 0 ? <Empty title="Nenhuma notificação" /> : (
        <Card><ul className="divide-y divide-slate-100">{rows.map((n) => (
          <li key={n.id} className={`px-5 py-3 text-sm ${n.read_at ? "" : "bg-brand-50/50"}`}>
            <div className="flex justify-between gap-3"><p className="font-medium text-slate-900">{n.link ? <Link href={n.link} className="hover:text-brand-700">{n.title}</Link> : n.title}</p><span className="whitespace-nowrap text-xs text-slate-500">{dateTimeBR(n.created_at)}</span></div>
            {n.body && <p className="text-slate-600">{n.body}</p>}
          </li>))}</ul></Card>
      )}
    </div>
  );
}

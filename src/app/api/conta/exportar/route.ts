import { NextResponse } from "next/server";
import { getCurrentUser, userDb } from "@/lib/auth/session";

/** Portabilidade (LGPD art. 18, V): exporta os dados pessoais do titular. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const data = await userDb(async (tx) => ({
    usuario: await tx.one("SELECT id, email, full_name, phone, marketing_consent, terms_accepted_at, privacy_accepted_at, created_at, last_login_at FROM users WHERE id = $1", [user.id]),
    organizacoes: user.memberships,
    favoritos: await tx.many("SELECT ata_id, stage, note, created_at FROM favorites WHERE user_id = $1", [user.id]),
    pesquisas_salvas: await tx.many("SELECT name, query, created_at FROM saved_searches WHERE user_id = $1", [user.id]),
    historico_pesquisas: await tx.many("SELECT query, results_count, created_at FROM search_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000", [user.id]),
    alertas: await tx.many("SELECT kind, days_before, active, created_at FROM alerts WHERE user_id = $1", [user.id]),
    solicitacoes: await tx.many("SELECT ata_id, kind, message, contact_name, contact_email, contact_phone, status, created_at FROM contact_requests WHERE requester_user_id = $1", [user.id]),
    gerado_em: new Date().toISOString(),
  }));
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=meus-dados.json" } });
}

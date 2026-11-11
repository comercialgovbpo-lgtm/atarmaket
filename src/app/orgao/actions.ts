"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { canWriteOrg, getCurrentUser, requireOrg, userDb } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { notifyUsers, orgUserIds, queueEmail } from "@/lib/notify";
import { getEntitlements, has } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { searchSchema } from "@/lib/atas/search";
import { ata_public_check } from "./guards";
import { emailSchema, formDataToObject, optText, parseBrNumber, text, uuidSchema } from "@/lib/validators";

async function govCtx(feature?: string) {
  const { user, org } = await requireOrg("government");
  if (feature) {
    const ent = await userDb((tx) => getEntitlements(tx, org.organization_id));
    if (!has(ent, feature)) return { user, org, denied: true as const };
  }
  return { user, org, denied: false as const };
}

export async function toggleFavoriteAction(fd: FormData) {
  const user = await getCurrentUser();
  const ataId = uuidSchema.safeParse(fd.get("ata_id"));
  if (!user || !ataId.success) redirect("/entrar");
  const { org, denied } = await govCtx("favorites");
  if (denied) redirect("/orgao/licenca?recurso=favoritos");
  await userDb(async (tx) => {
    const removed = await tx.exec("DELETE FROM favorites WHERE user_id = $1 AND ata_id = $2", [user.id, ataId.data]);
    if (!removed) await tx.exec("INSERT INTO favorites(user_id, ata_id, organization_id) VALUES ($1,$2,$3)", [user.id, ataId.data, org.organization_id]);
  });
  revalidatePath(`/atas/${ataId.data}`);
  revalidatePath("/orgao/favoritos");
}

export async function updateFavoriteAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  const p = z.object({ ata_id: uuidSchema, stage: z.enum(["salva", "em_analise", "consulta_enviada", "descartada", "encaminhada"]), note: optText(1000) }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await userDb((tx) => tx.exec("UPDATE favorites SET stage = $3, note = $4 WHERE user_id = $1 AND ata_id = $2", [user.id, p.data.ata_id, p.data.stage, p.data.note ?? null]));
  revalidatePath("/orgao/favoritos");
}

export async function saveSearchAction(fd: FormData) {
  const { user, org, denied } = await govCtx("saved_searches");
  if (denied) redirect("/orgao/licenca?recurso=pesquisas");
  const name = text(80).safeParse(fd.get("name"));
  let query: unknown;
  try { query = searchSchema.parse(JSON.parse(String(fd.get("query") ?? "{}"))); } catch { query = null; }
  if (!name.success || !name.data || !query) return;
  await userDb(async (tx) => {
    const s = await tx.one<{ id: string }>("INSERT INTO saved_searches(user_id, organization_id, name, query, last_run_at) VALUES ($1,$2,$3,$4,now()) RETURNING id",
      [user.id, org.organization_id, name.data, JSON.stringify(query)]);
    if (fd.get("alert") === "on")
      await tx.exec("INSERT INTO alerts(user_id, organization_id, kind, saved_search_id, last_checked_at) VALUES ($1,$2,'novas_atas_pesquisa',$3,now())", [user.id, org.organization_id, s!.id]);
  });
  redirect("/orgao/pesquisas?salva=1");
}

export async function deleteSavedSearchAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!user || !id.success) return;
  await userDb((tx) => tx.exec("DELETE FROM saved_searches WHERE id = $1 AND user_id = $2", [id.data, user.id]));
  revalidatePath("/orgao/pesquisas");
}

export async function createExpiryAlertAction(fd: FormData) {
  const { user, org, denied } = await govCtx("alerts");
  if (denied) redirect("/orgao/licenca?recurso=alertas");
  const p = z.object({ ata_id: uuidSchema, days_before: z.coerce.number().int().min(1).max(365) }).safeParse(formDataToObject(fd));
  if (!p.success) return;
  await userDb((tx) => tx.exec("INSERT INTO alerts(user_id, organization_id, kind, ata_id, days_before) VALUES ($1,$2,'vencimento_ata',$3,$4)",
    [user.id, org.organization_id, p.data.ata_id, p.data.days_before]));
  revalidatePath("/orgao/alertas");
}

export async function toggleAlertAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!user || !id.success) return;
  if (fd.get("op") === "delete") await userDb((tx) => tx.exec("DELETE FROM alerts WHERE id = $1 AND user_id = $2", [id.data, user.id]));
  else await userDb((tx) => tx.exec("UPDATE alerts SET active = NOT active WHERE id = $1 AND user_id = $2", [id.data, user.id]));
  revalidatePath("/orgao/alertas");
}

const contactSchema = z.object({
  ata_id: uuidSchema,
  ata_item_id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()),
  kind: z.enum(["informacoes", "interesse_comercial"]),
  intended_quantity: z.string().optional(),
  contact_name: text(120).pipe(z.string().min(3, "Informe o responsável")),
  contact_email: emailSchema,
  contact_phone: optText(30),
  message: text(3000).pipe(z.string().min(10, "Descreva a solicitação (mínimo de 10 caracteres)")),
  ack: z.literal("on", { message: "Confirme a ciência de que a solicitação não é adesão" }),
});

export async function contactRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await govCtx();
  if (!canWriteOrg(org)) return { error: "Seu perfil é somente leitura. Peça a um administrador do órgão para enviar a solicitação." };
  if (!rateLimit(`contact:${org.organization_id}`, 30, 86_400_000).ok) return { error: "Limite diário de solicitações atingido." };
  const p = contactSchema.safeParse(formDataToObject(fd));
  if (!p.success) return { fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const d = p.data;
  const qty = parseBrNumber(d.intended_quantity);

  const created = await userDb(async (tx) => {
    const ata = await ata_public_check(tx, d.ata_id);
    if (!ata) return { error: "Ata indisponível para solicitações." };
    let supplierId = ata.supplier_id;
    if (d.ata_item_id) {
      const item = await tx.one<{ supplier_id: string | null }>(
        "SELECT supplier_id FROM ata_items WHERE id = $1 AND (ata_id = $2 OR (ata_id IS NULL AND procurement_record_id = $3))",
        [d.ata_item_id, d.ata_id, ata.procurement_record_id]);
      if (!item) return { error: "Item inválido." };
      supplierId = item.supplier_id ?? supplierId;
    }
    if (!supplierId) return { error: "Selecione o item de interesse para identificar o fornecedor (esta ata possui fornecedor não confirmado)." };
    const linked = await tx.one<{ organization_id: string | null }>("SELECT organization_id FROM suppliers WHERE id = $1", [supplierId]);
    const row = await tx.one<{ id: string }>(
      `INSERT INTO contact_requests(ata_id, ata_item_id, supplier_id, requester_user_id, requester_org_id, kind, intended_quantity, message,
          contact_name, contact_email, contact_phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [d.ata_id, d.ata_item_id ?? null, supplierId, user.id, org.organization_id, d.kind, qty, d.message, d.contact_name, d.contact_email,
       d.contact_phone ?? null, linked?.organization_id ? "enviada" : "aguardando_fornecedor"]);
    return { id: row!.id, supplierOrg: linked?.organization_id ?? null, ataNumber: ata.ata_number };
  });
  if ("error" in created) return { error: created.error };

  // Encaminha ao fornecedor (CRM + notificação) — operação do servidor
  await systemDb(async (tx) => {
    if (created.supplierOrg) {
      const opp = await tx.one<{ id: string }>(
        `INSERT INTO commercial_opportunities(supplier_org_id, contact_request_id, ata_id, title, government_name, government_org_id, contact_name, contact_email, contact_phone, last_contact_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,current_date) RETURNING id`,
        [created.supplierOrg, created.id, d.ata_id, `${d.kind === "interesse_comercial" ? "Interesse comercial" : "Pedido de informações"} — Ata ${created.ataNumber}`,
         org.legal_name, org.organization_id, d.contact_name, d.contact_email, d.contact_phone ?? null]);
      await tx.exec("INSERT INTO opportunity_events(opportunity_id, kind, to_status, note) VALUES ($1,'mudanca_status','novo_interessado',$2)",
        [opp!.id, "Criada a partir de solicitação enviada pela plataforma"]);
      const members = await orgUserIds(tx, created.supplierOrg);
      await notifyUsers(tx, members, { title: `Nova solicitação de ${org.legal_name}`, body: `Ata ${created.ataNumber}`, link: `/fornecedor/solicitacoes`, dedupeKey: `cr:${created.id}` });
      const emails = await tx.many<{ email: string }>("SELECT u.email FROM users u JOIN organization_members m ON m.user_id = u.id WHERE m.organization_id = $1", [created.supplierOrg]);
      for (const e of emails) await queueEmail(tx, e.email, `Nova solicitação — Ata ${created.ataNumber}`, `${org.legal_name} enviou uma solicitação pela plataforma. Acesse o painel para responder.`);
    }
    await audit(tx, { id: user.id, role: "user" }, "solicitacao_enviada", "contact_request", created.id, { ata: d.ata_id });
  });
  redirect(`/atas/${d.ata_id}?enviado=1#solicitar`);
}

export async function closeRequestAction(fd: FormData) {
  await requireOrg("government");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  await userDb((tx) => tx.exec("UPDATE contact_requests SET status = 'encerrada' WHERE id = $1", [id.data]));
  revalidatePath("/orgao/solicitacoes");
}

export async function saveOrgAssessmentAction(fd: FormData) {
  const { user, org } = await govCtx();
  if (!canWriteOrg(org)) return;
  const ataId = uuidSchema.safeParse(fd.get("ata_id"));
  if (!ataId.success) return;
  const criteria: Record<string, { ok: boolean | null }> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("c_")) criteria[k.slice(2)] = { ok: v === "sim" ? true : v === "nao" ? false : null };
  const conclusion = z.enum(["sem_impedimento_aparente", "requer_analise_adicional", "impedimento_identificado"]).catch("requer_analise_adicional").parse(fd.get("conclusion"));
  await userDb(async (tx) => {
    await tx.exec(
      "INSERT INTO ata_adhesion_assessments(ata_id, assessed_by, scope, organization_id, criteria, conclusion, caveats) VALUES ($1,$2,'orgao',$3,$4,$5,$6)",
      [ataId.data, user.id, org.organization_id, JSON.stringify(criteria), conclusion, optText(2000).parse(fd.get("caveats") ?? undefined) ?? null]);
    await audit(tx, { id: user.id, role: "user" }, "analise_adesao_registrada", "ata", ataId.data);
  });
  revalidatePath("/orgao/favoritos");
}

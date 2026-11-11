import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

export default async function PanelRedirect() {
  const u = await requireUser("/painel");
  if (u.platform_role === "admin" && !u.activeOrg) redirect("/admin");
  if (u.activeOrg?.kind === "supplier") redirect("/fornecedor");
  if (u.activeOrg?.kind === "government") redirect("/orgao");
  redirect(u.platform_role === "admin" ? "/admin" : "/conta");
}

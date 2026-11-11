import { NextResponse } from "next/server";
import { getCurrentUser, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { searchAtas } from "@/lib/atas/search";
import { uuidSchema } from "@/lib/validators";

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`; // evita injeção de fórmulas

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.activeOrg?.kind !== "government") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((x) => uuidSchema.safeParse(x).success).slice(0, 5);
  const q = url.searchParams.get("q") ?? undefined;
  const rows = await userDb(async (tx) => {
    if (!has(await getEntitlements(tx, user.activeOrg!.organization_id), "compare")) return null;
    return (await searchAtas(tx, { q, somenteVigentes: "0" }, { ids, pageSize: 5 })).rows;
  });
  if (!rows) return NextResponse.json({ error: "Recurso não incluído no plano" }, { status: 403 });
  const head = ["Ata", "Status", "Objeto", "Item", "Preço unitário", "Unidade", "Quantidade registrada", "Fornecedor", "CNPJ", "Vigência início", "Vigência fim", "Órgão gerenciador", "Município", "UF", "Fonte", "URL"];
  const body = rows.map((r) => [r.ata_number, r.status, r.object, r.item_description, r.item_unit_price, r.item_unit, r.item_quantity, r.supplier_name ?? r.item_supplier_name,
    r.supplier_cnpj ?? r.item_supplier_ni, r.validity_start, r.validity_end, r.manager_name, r.city, r.state, r.source_name, r.source_url].map(csv).join(";"));
  const content = "﻿" + [head.map(csv).join(";"), ...body, "", csv("Dados informativos. Não representam saldo, autorização de adesão ou vantajosidade.")].join("\r\n");
  return new NextResponse(content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=comparativo-atas.csv" } });
}

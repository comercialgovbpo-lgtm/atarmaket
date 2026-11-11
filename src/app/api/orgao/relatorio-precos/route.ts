import { NextResponse } from "next/server";
import { getCurrentUser, userDb } from "@/lib/auth/session";
import { getEntitlements, has } from "@/lib/plans";
import { priceReport } from "@/lib/atas/reports";
import { UFS } from "@/lib/validators";

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.activeOrg?.kind !== "government") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
  const ufp = u.searchParams.get("uf") ?? undefined;
  const uf = UFS.includes(ufp as (typeof UFS)[number]) ? ufp : undefined;
  const unit = u.searchParams.get("unidade")?.toUpperCase();
  if (q.length < 3) return NextResponse.json({ error: "Termo muito curto" }, { status: 400 });
  const rep = await userDb(async (tx) => (has(await getEntitlements(tx, user.activeOrg!.organization_id), "reports") ? priceReport(tx, { q, uf, onlyActive: u.searchParams.get("vigentes") !== "0" }) : null));
  if (!rep) return NextResponse.json({ error: "Recurso não incluído na licença" }, { status: 403 });
  const rows = rep.rows.filter((r) => !unit || (r.unit ?? "NÃO INFORMADA").trim().toUpperCase() === unit);
  const lines = [
    ["Termo", q, "UF", uf ?? "Brasil", "Gerado em", new Date().toLocaleString("pt-BR")].map(csv).join(";"),
    "",
    ["Unidade", "Registros", "Atas", "Mínimo", "1º quartil", "Mediana", "3º quartil", "Máximo", "Média"].map(csv).join(";"),
    ...rep.stats.map((s) => [s.unit, s.n, s.atas, s.min, s.p25, s.median, s.p75, s.max, s.mean.toFixed(4)].map(csv).join(";")),
    "",
    ["Descrição", "Unidade", "Preço unitário", "Quantidade registrada", "Ata", "Órgão gerenciador", "Município", "UF", "Fim da vigência", "Fornecedor", "URL"].map(csv).join(";"),
    ...rows.map((r) => [r.description, r.unit, r.unit_price, r.quantity, r.ata_number, r.manager, r.city, r.state, r.validity_end, r.supplier_name, `${u.origin}/atas/${r.ata_id}`].map(csv).join(";")),
    "",
    csv("Fonte complementar para pesquisa de preços (art. 23). Conferir especificações e condições; valores não indicam saldo nem vantajosidade."),
  ];
  return new NextResponse("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=referencia-precos.csv" } });
}

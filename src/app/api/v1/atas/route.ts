import { NextResponse } from "next/server";
import { anonDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseSearch, searchAtas } from "@/lib/atas/search";

/** API pública de consulta (somente dados públicos), com limite de requisições. */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`api:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Limite de requisições excedido" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const url = new URL(req.url);
  const p = parseSearch(Object.fromEntries(url.searchParams.entries()));
  const r = await anonDb((tx) => searchAtas(tx, p, { pageSize: 20 }));
  return NextResponse.json({
    total: r.total, pagina: r.page, tamanhoPagina: r.pageSize,
    aviso: "A disponibilização de atas não representa autorização para adesão. Quantidades registradas não são saldo disponível.",
    dados: r.rows.map((x) => ({
      id: x.id, numero: x.ata_number, ano: x.year, objeto: x.object, status: x.status, origem: x.origin, vigencia: { inicio: x.validity_start, fim: x.validity_end }, cancelada: x.cancelled,
      orgaoGerenciador: { nome: x.manager_name, cnpj: x.manager_cnpj, esfera: x.manager_sphere }, municipio: x.city, uf: x.state,
      fornecedor: x.supplier_name ? { nome: x.supplier_name, cnpj: x.supplier_cnpj } : null,
      itemReferencia: x.item_description ? { descricao: x.item_description, unidade: x.item_unit, quantidadeRegistrada: x.item_quantity, precoUnitario: x.item_unit_price, codigo: x.item_catalog } : null,
      fonte: { nome: x.source_name, url: x.source_url, documento: x.original_document_url }, url: `${url.origin}/atas/${x.id}`,
    })),
  }, { headers: { "Cache-Control": "public, max-age=120" } });
}

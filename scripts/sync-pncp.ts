/**
 * Sincronização PNCP via linha de comando (cron do servidor / GitHub Actions / carga histórica).
 *   npm run sync:pncp -- --mode=atualizacao --days=2 --pages=5
 *   npm run sync:pncp -- --mode=vigencia --pages=20 --batches=50 --resume --items=0   (fase 1: metadados, retomável)
 *   npm run sync:pncp -- --mode=itens --limit=50 --batches=100                          (fase 2: itens e preços)
 * --resume continua da última página processada na mesma data de referência.
 */
import { Client } from "pg";
import { runItemsBackfill, runPncpSync } from "../src/lib/sync/pncp-sync";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const flag = (k: string) => process.argv.includes(`--${k}`);

async function lastPage(mode: string, from: string, to: string, size: number): Promise<number> {
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(
    `SELECT max((params->>'lastPage')::int) AS p FROM synchronization_logs
      WHERE job = $1 AND params->>'from' = $2 AND params->>'to' = $3 AND coalesce((params->>'pageSize')::int, 50) = $4 AND status IN ('sucesso','parcial')`, [`pncp_${mode}`, from, to, size]);
  await c.end();
  return Number(r.rows[0]?.p ?? 0);
}

async function main() {
  if (arg("mode") === "itens") {
    for (let b = 0; b < Number(arg("batches") ?? 1); b++) {
      const r = await runItemsBackfill(Number(arg("limit") ?? 50));
      console.log(JSON.stringify({ lote: b + 1, ...r }));
      if (!r.pending) break;
    }
    process.exit(0);
  }
  const mode = (arg("mode") as "atualizacao" | "vigencia") ?? "atualizacao";
  const days = Number(arg("days") ?? 2);
  const to = arg("to") ? new Date(arg("to")!) : new Date();
  const from = arg("from") ? new Date(arg("from")!) : mode === "vigencia" ? to : new Date(to.getTime() - days * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const size = arg("size") ? Number(arg("size")) : 50;
  const pages = arg("pages") ? Number(arg("pages")) : undefined;
  const batches = Number(arg("batches") ?? 1);
  let start = arg("start") ? Number(arg("start")) : flag("resume") ? (await lastPage(mode, ymd(from), ymd(to), size)) + 1 : 1;

  for (let b = 0; b < batches; b++) {
    const res = await runPncpSync({ mode, from, to, maxPages: pages, pageSize: size, startPage: start, fetchItems: arg("items") !== "0", triggeredBy: "cli" });
    console.log(JSON.stringify({ lote: b + 1, inicio: start, ...res, details: res.details.slice(0, 3) }));
    if (!res.lastPage || res.lastPage >= res.totalPages || res.status === "falhou") break;
    start = res.lastPage + 1;
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

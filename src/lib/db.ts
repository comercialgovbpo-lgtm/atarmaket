import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";
import pg from "pg";

// Datas (DATE) como string ISO "AAAA-MM-DD" para evitar deslocamento de fuso.
pg.types.setTypeParser(1082, (v: string) => v);

/**
 * Contexto de segurança aplicado a cada transação. As políticas RLS do banco leem
 * app.user_id e app.role. "system" é reservado a rotinas do servidor (autenticação,
 * sincronização) e nunca deriva de entrada do usuário.
 */
export type DbRole = "anon" | "user" | "admin" | "system";
export interface DbCtx { userId?: string | null; role: DbRole }

const g = globalThis as unknown as { __pgPool?: Pool };
function pool(): Pool {
  if (!g.__pgPool) {
    g.__pgPool = new Pool({
      connectionString: env.databaseUrl,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g.__pgPool;
}

export class Tx {
  constructor(private c: PoolClient) {}
  async many<T extends QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.c.query<T>(sql, params)).rows;
  }
  async one<T extends QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await this.c.query<T>(sql, params)).rows[0] ?? null;
  }
  async exec(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.c.query(sql, params)).rowCount ?? 0;
  }
}

export async function withDb<T>(ctx: DbCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)", [
      ctx.userId ?? "",
      ctx.role,
    ]);
    const result = await fn(new Tx(client));
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const anonDb = <T>(fn: (tx: Tx) => Promise<T>) => withDb({ role: "anon" }, fn);
export const systemDb = <T>(fn: (tx: Tx) => Promise<T>) => withDb({ role: "system" }, fn);

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Armazenamento de documentos com driver intercambiável.
 * - local: disco do servidor (desenvolvimento / VPS)
 * - supabase: bucket PRIVADO do Supabase Storage (acesso apenas pelo servidor com service role)
 * Os arquivos nunca são servidos diretamente: o download passa por /api/documentos/[id],
 * que verifica a permissão via RLS antes de entregar o conteúdo.
 */
export interface StoredFile { storagePath: string; sha256: string; size: number }

const MAX_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

export function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  return null;
}

export async function putFile(buf: Buffer, ext: string, prefix: string): Promise<StoredFile> {
  if (buf.length > MAX_BYTES) throw new Error("Arquivo excede 25 MB");
  const sha = createHash("sha256").update(buf).digest("hex");
  const safePrefix = prefix.replace(/[^a-z0-9/_-]/gi, "");
  const storagePath = `${safePrefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext.replace(/\W/g, "")}`;
  if (env.storageDriver === "supabase") {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${env.supabaseBucket}/${storagePath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.supabaseServiceKey}`, "Content-Type": "application/octet-stream", "x-upsert": "false" },
      body: new Uint8Array(buf),
    });
    if (!res.ok) throw new Error(`Falha no upload (${res.status})`);
  } else {
    const full = resolveLocal(storagePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf, { mode: 0o600 });
  }
  return { storagePath, sha256: sha, size: buf.length };
}

export async function getFile(storagePath: string): Promise<Buffer> {
  if (env.storageDriver === "supabase") {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${env.supabaseBucket}/${storagePath}`, {
      headers: { Authorization: `Bearer ${env.supabaseServiceKey}` },
    });
    if (!res.ok) throw new Error(`Arquivo indisponível (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(resolveLocal(storagePath));
}

export async function deleteFile(storagePath: string) {
  if (env.storageDriver === "supabase") {
    await fetch(`${env.supabaseUrl}/storage/v1/object/${env.supabaseBucket}/${storagePath}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${env.supabaseServiceKey}` },
    });
  } else await unlink(resolveLocal(storagePath)).catch(() => {});
}

function resolveLocal(p: string) {
  const base = path.resolve(env.storageLocalDir);
  const full = path.resolve(base, p);
  if (!full.startsWith(base + path.sep)) throw new Error("Caminho inválido");
  return full;
}

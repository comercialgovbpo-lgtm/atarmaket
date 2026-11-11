import { NextResponse } from "next/server";
import { getCurrentUser, userDb } from "@/lib/auth/session";
import { getFile } from "@/lib/storage";
import { uuidSchema } from "@/lib/validators";

/** Entrega documentos armazenados apenas se a política RLS permitir a leitura do registro. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return new NextResponse("Não encontrado", { status: 404 });
  await getCurrentUser();
  const doc = await userDb((tx) => tx.one<{ storage_path: string | null; external_url: string | null; mime_type: string | null; title: string }>(
    "SELECT storage_path, external_url, mime_type, title FROM ata_documents WHERE id = $1", [id]));
  if (!doc) return new NextResponse("Não encontrado ou sem permissão", { status: 404 });
  if (!doc.storage_path && doc.external_url) return NextResponse.redirect(doc.external_url);
  const buf = await getFile(doc.storage_path!);
  const safeName = doc.title.replace(/[^\w.\- ]+/g, "_").slice(0, 100);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime_type ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}${safeName.toLowerCase().endsWith(".pdf") || doc.mime_type !== "application/pdf" ? "" : ".pdf"}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

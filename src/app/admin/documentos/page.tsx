import Link from "next/link";
import { Badge, Card, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { dateTimeBR } from "@/lib/format";
import { adminRead } from "../db";

export const metadata = { title: "Documentos" };

export default async function Docs({ searchParams }: { searchParams: Promise<{ tipo?: string; origem?: string }> }) {
  const sp = await searchParams;
  const rows = await adminRead((tx) => tx.many<{ id: string; title: string; kind: string; visibility: string; storage_path: string | null; external_url: string | null; size_bytes: number | null; created_at: Date; ata_id: string | null; ata_number: string | null; org: string | null }>(
    `SELECT d.id, d.title, d.kind, d.visibility, d.storage_path, d.external_url, d.size_bytes, d.created_at, d.ata_id, a.ata_number, o.legal_name org
       FROM ata_documents d LEFT JOIN price_registration_atas a ON a.id = d.ata_id LEFT JOIN organizations o ON o.id = d.owner_org_id
      WHERE ($1::text IS NULL OR d.kind = $1) AND ($2::text IS NULL OR ($2 = 'upload' AND d.storage_path IS NOT NULL) OR ($2 = 'fonte' AND d.external_url IS NOT NULL))
      ORDER BY d.created_at DESC LIMIT 200`, [sp.tipo || null, sp.origem || null]));
  return (
    <>
      <PageHeader title="Documentos" description="Arquivos enviados ficam em armazenamento privado e são entregues somente após verificação de permissão." />
      <form className="mb-4 flex gap-2">
        <Select name="tipo" defaultValue={sp.tipo ?? ""} className="w-48"><option value="">Todos os tipos</option><option value="ata">Ata</option><option value="edital">Edital</option><option value="termo_aditivo">Termo aditivo</option><option value="evidencia">Evidência</option><option value="outro">Outro</option></Select>
        <Select name="origem" defaultValue={sp.origem ?? ""} className="w-48"><option value="">Todas as origens</option><option value="upload">Enviados</option><option value="fonte">Fonte pública</option></Select>
        <button className="h-10 rounded-lg border border-slate-300 px-4 text-sm">Filtrar</button>
      </form>
      <Card><Table><thead><tr><Th>Documento</Th><Th>Tipo</Th><Th>Visibilidade</Th><Th>Ata</Th><Th>Enviado por</Th><Th>Data</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((d) => (
          <tr key={d.id}><Td><a className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer" href={d.external_url ?? `/api/documentos/${d.id}`}>{d.title}</a>{d.size_bytes ? <span className="ml-1 text-xs text-slate-400">{Math.round(d.size_bytes / 1024)} KB</span> : null}</Td>
            <Td>{d.kind}</Td><Td><Badge tone={d.visibility === "public" ? "blue" : "gray"}>{d.visibility}</Badge></Td>
            <Td>{d.ata_id ? <Link className="text-brand-700 hover:underline" href={`/admin/atas/${d.ata_id}`}>{d.ata_number}</Link> : "—"}</Td><Td className="text-xs">{d.org ?? (d.external_url ? "Fonte pública" : "—")}</Td><Td className="text-xs">{dateTimeBR(d.created_at)}</Td></tr>))}</tbody></Table></Card>
    </>
  );
}

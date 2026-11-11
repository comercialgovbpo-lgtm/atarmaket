import type { MetadataRoute } from "next";
import { anonDb } from "@/lib/db";
import { PUBLIC_STATUSES } from "@/lib/atas/status";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const atas = await anonDb((tx) => tx.many<{ id: string; updated_at: Date }>(
    `SELECT id, updated_at FROM price_registration_atas WHERE status = ANY($1) AND status <> 'encerrada' AND duplicate_of IS NULL
      ORDER BY updated_at DESC LIMIT 45000`, [PUBLIC_STATUSES]));
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/atas`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/planos`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/sobre-os-dados`, changeFrequency: "monthly", priority: 0.4 },
    ...atas.map((a) => ({ url: `${base}/atas/${a.id}`, lastModified: a.updated_at, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}

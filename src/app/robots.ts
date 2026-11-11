import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/atas", "/fornecedores/", "/orgaos/"], disallow: ["/admin", "/fornecedor", "/orgao", "/conta", "/api/", "/notificacoes", "/painel"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}

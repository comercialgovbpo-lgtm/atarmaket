import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, SiteFooter, SiteHeader } from "@/components/site";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — Marketplace Nacional de Atas Públicas`, template: `%s · ${APP_NAME}` },
  description: "Encontre atas públicas de registro de preços, amplie oportunidades de negócios e conecte quem vende a quem precisa comprar.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#0f2240" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen flex-col antialiased">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Pular para o conteúdo</a>
        <SiteHeader />
        <main id="conteudo" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

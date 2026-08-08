import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Pós-vendas | Autoglass";
  const description = "Indicadores de TMA, CSAT e atendimentos da equipe de pós-vendas.";

  return {
    title,
    description,
    icons: { icon: "/autoglass-logo-oficial.png", shortcut: "/autoglass-logo-oficial.png" },
    openGraph: { title, description, type: "website", images: [{ url: `${origin}/og.png`, width: 1672, height: 942, alt: "Pós-vendas — Indicadores de julho de 2026" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

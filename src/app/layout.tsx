import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassDiary — Diário de Classe Online",
  description: "Gestão escolar simples, inteligente e completa para escolas modernas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

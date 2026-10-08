import type { Metadata } from "next";
import "./globals.css";
import { ToastHost } from "@/components/toast-host";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "EduSync — Diário de Classe Online",
  description: "Gestão escolar simples, inteligente e completa para escolas modernas.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EduSync", statusBarStyle: "default" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "(() => {\n  try {\n    const stored = window.localStorage.getItem(\"edusync-theme\");\n    const prefersDark = window.matchMedia(\"(prefers-color-scheme: dark)\").matches;\n    const theme = stored === \"dark\" || (stored !== \"light\" && prefersDark) ? \"dark\" : \"light\";\n    document.documentElement.dataset.theme = theme;\n    document.documentElement.style.colorScheme = theme;\n  } catch {\n    document.documentElement.dataset.theme = \"light\";\n  }\n})();" }} />
      </head>
      <body>{children}<ToastHost /><PwaRegister /></body>
    </html>
  );
}

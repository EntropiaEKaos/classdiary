"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { usePathname } from "next/navigation";

const labels: Record<string, string> = {
  "meu-dia": "Meu dia",
  buscar: "Busca",
  perfil: "Perfil",
  alunos: "Alunos",
  turmas: "Turmas",
  professores: "Professores",
  configuracoes: "Configurações",
  financeiro: "Financeiro",
  relatorios: "Relatórios",
  diarios: "Diário de classe",
  frequencia: "Frequência",
  notas: "Notas",
  atividades: "Atividades",
  calendario: "Calendário",
};

function humanize(segment: string) {
  return labels[segment] ?? segment.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function DashboardBreadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;

  const segments = pathname.split("/").filter(Boolean).slice(1);
  let href = "/dashboard";

  return (
    <nav className="dashboard-breadcrumbs" aria-label="Breadcrumb">
      <Link href="/dashboard"><Home size={14} /><span>Dashboard</span></Link>
      {segments.map((segment, index) => {
        href += "/" + segment;
        const last = index === segments.length - 1;
        return (
          <span className="breadcrumb-segment" key={href}>
            <ChevronRight size={13} />
            {last ? <strong>{humanize(segment)}</strong> : <Link href={href}>{humanize(segment)}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

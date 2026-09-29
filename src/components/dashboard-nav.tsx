import Link from "next/link";
import {
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  FileText,
  Files,
  GraduationCap,
  Landmark,
  Layers3,
  LayoutDashboard,
  Megaphone,
  NotebookTabs,
  School,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";

const items = [
  ["/dashboard", "Visão geral", LayoutDashboard],
  ["/dashboard/alunos", "Alunos", GraduationCap],
  ["/dashboard/turmas", "Turmas", School],
  ["/dashboard/matriculas", "Matrículas", Layers3],
  ["/dashboard/rematricula", "Rematrícula", Layers3],
  ["/dashboard/importar-alunos", "Importar alunos", UserPlus],
  ["/dashboard/resultados", "Resultados anuais", ChartNoAxesColumnIncreasing],
  ["/dashboard/professores", "Professores", Users],
  ["/dashboard/convites", "Convites", UserPlus],
  ["/dashboard/disciplinas", "Disciplinas", FileText],
  ["/dashboard/horarios", "Horários", CalendarDays],
  ["/dashboard/diarios", "Diário de classe", BookOpenCheck],
  ["/dashboard/frequencia", "Frequência", ClipboardCheck],
  ["/dashboard/justificativas", "Justificativas", ClipboardCheck],
  ["/dashboard/atividades", "Atividades", NotebookTabs],
  ["/dashboard/notas", "Notas", ChartNoAxesColumnIncreasing],
  ["/dashboard/revisoes-notas", "Revisões de nota", ChartNoAxesColumnIncreasing],
  ["/dashboard/recuperacao", "Recuperação", ChartNoAxesColumnIncreasing],
  ["/dashboard/boletins", "Boletins", FileText],
  ["/dashboard/conselho", "Conselho", Landmark],
  ["/dashboard/ocorrencias", "Ocorrências", TriangleAlert],
  ["/dashboard/calendario", "Calendário", CalendarDays],
  ["/dashboard/comunicados", "Comunicados", Megaphone],
  ["/dashboard/relatorios", "Relatórios", ChartNoAxesColumnIncreasing],
  ["/dashboard/historico", "Histórico", Files],
  ["/dashboard/documentos", "Documentos", FileText],
  ["/dashboard/financeiro", "Financeiro", ChartNoAxesColumnIncreasing],
  ["/dashboard/auditoria", "Auditoria", FileText],
  ["/dashboard/configuracoes", "Configurações", FileText],
] as const;

export function DashboardNav() {
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="logo"><BookOpenCheck size={20} /></span>
        ClassDiary
      </Link>
      {items.map(([href, label, Icon]) => (
        <Link className="side-link" href={href} key={href}>
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </aside>
  );
}

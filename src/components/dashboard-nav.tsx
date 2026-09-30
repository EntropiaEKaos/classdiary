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
import { activeOrganization, requireUser } from "@/lib/auth";
import { getAllowedModules, type SchoolRole } from "@/lib/rbac";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof BookOpenCheck;
  module?: string;
  roles?: SchoolRole[];
};

const items: NavItem[] = [
  { href: "/dashboard", label: "Visão geral", Icon: LayoutDashboard },
  { href: "/dashboard/executivo", label: "Visão executiva", Icon: ChartNoAxesColumnIncreasing, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },

  { href: "/dashboard/alunos", label: "Alunos", Icon: GraduationCap, module: "students" },
  { href: "/dashboard/turmas", label: "Turmas", Icon: School, module: "academic" },
  { href: "/dashboard/matriculas", label: "Matrículas", Icon: Layers3, module: "students" },
  { href: "/dashboard/rematricula", label: "Rematrícula", Icon: Layers3, module: "students" },
  { href: "/dashboard/importar-alunos", label: "Importar alunos", Icon: UserPlus, module: "students" },
  { href: "/dashboard/pre-inscricoes", label: "Pré-inscrições", Icon: UserPlus, module: "crm" },
  { href: "/dashboard/crm", label: "CRM", Icon: UserPlus, module: "crm" },
  { href: "/dashboard/resultados", label: "Resultados anuais", Icon: ChartNoAxesColumnIncreasing, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },
  { href: "/dashboard/fechamento-anual", label: "Fechamento anual", Icon: ClipboardCheck, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },
  { href: "/dashboard/professores", label: "Professores", Icon: Users, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },
  { href: "/dashboard/convites", label: "Convites", Icon: UserPlus, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },

  { href: "/dashboard/disciplinas", label: "Disciplinas", Icon: FileText, module: "academic" },
  { href: "/dashboard/horarios", label: "Horários", Icon: CalendarDays, module: "academic" },
  { href: "/dashboard/diarios", label: "Diário de classe", Icon: BookOpenCheck, module: "academic" },
  { href: "/dashboard/operacao-academica", label: "Operação acadêmica", Icon: ClipboardCheck, module: "academic" },
  { href: "/dashboard/frequencia", label: "Frequência", Icon: ClipboardCheck, module: "academic" },
  { href: "/dashboard/justificativas", label: "Justificativas", Icon: ClipboardCheck, module: "academic" },
  { href: "/dashboard/atividades", label: "Atividades", Icon: NotebookTabs, module: "academic" },
  { href: "/dashboard/notas", label: "Notas", Icon: ChartNoAxesColumnIncreasing, module: "academic" },
  { href: "/dashboard/revisoes-notas", label: "Revisões de nota", Icon: ChartNoAxesColumnIncreasing, module: "academic" },
  { href: "/dashboard/recuperacao", label: "Recuperação", Icon: ChartNoAxesColumnIncreasing, module: "academic" },
  { href: "/dashboard/boletins", label: "Boletins", Icon: FileText, module: "academic" },
  { href: "/dashboard/conselho", label: "Conselho", Icon: Landmark, module: "academic" },
  { href: "/dashboard/ocorrencias", label: "Ocorrências", Icon: TriangleAlert, module: "academic" },
  { href: "/dashboard/calendario", label: "Calendário", Icon: CalendarDays, module: "academic" },
  { href: "/dashboard/comunicados", label: "Comunicados", Icon: Megaphone, module: "messaging" },

  { href: "/dashboard/relatorios", label: "Relatórios", Icon: ChartNoAxesColumnIncreasing, module: "reports" },
  { href: "/dashboard/historico", label: "Histórico", Icon: Files, module: "reports" },
  { href: "/dashboard/documentos", label: "Documentos", Icon: FileText, module: "secretary" },
  { href: "/dashboard/financeiro", label: "Financeiro", Icon: ChartNoAxesColumnIncreasing, module: "finance" },
  { href: "/dashboard/auditoria", label: "Auditoria", Icon: FileText, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },
  { href: "/dashboard/permissoes", label: "Permissões", Icon: Users, roles: ["SCHOOL_ADMIN"] },
  { href: "/dashboard/templates", label: "Templates", Icon: FileText, module: "secretary" },
  { href: "/dashboard/arquivos", label: "Arquivos", Icon: Files, module: "secretary" },

  { href: "/dashboard/rh", label: "RH", Icon: Users, module: "hr" },
  { href: "/dashboard/patrimonio", label: "Patrimônio", Icon: Files, module: "assets" },
  { href: "/dashboard/estoque", label: "Estoque", Icon: Layers3, module: "inventory" },
  { href: "/dashboard/biblioteca", label: "Biblioteca", Icon: BookOpenCheck, module: "library" },
  { href: "/dashboard/transporte", label: "Transporte", Icon: School, module: "transport" },
  { href: "/dashboard/cantina", label: "Cantina", Icon: FileText, module: "canteen" },
  { href: "/dashboard/enfermaria", label: "Enfermaria", Icon: TriangleAlert, module: "health" },
  { href: "/dashboard/autorizacoes", label: "Autorizações", Icon: ClipboardCheck, module: "health" },
  { href: "/dashboard/recursos", label: "Recursos", Icon: CalendarDays, module: "resources" },
  { href: "/dashboard/manutencao", label: "Manutenção", Icon: Files, module: "maintenance" },
  { href: "/dashboard/compras", label: "Compras", Icon: Layers3, module: "procurement" },
  { href: "/dashboard/automacoes", label: "Automações", Icon: FileText, module: "automation" },

  { href: "/dashboard/qualidade", label: "Qualidade", Icon: ChartNoAxesColumnIncreasing, module: "quality" },
  { href: "/dashboard/metas", label: "Metas", Icon: ClipboardCheck, module: "goals" },
  { href: "/dashboard/bi", label: "BI executivo", Icon: ChartNoAxesColumnIncreasing, module: "bi" },
  { href: "/dashboard/assistente", label: "Assistente", Icon: FileText, module: "assistant" },

  { href: "/dashboard/curriculo", label: "Currículo", Icon: BookOpenCheck, module: "curriculum" },
  { href: "/dashboard/rubricas", label: "Rubricas", Icon: ClipboardCheck, module: "pedagogy" },
  { href: "/dashboard/planos-aula", label: "Planos de aula", Icon: NotebookTabs, module: "pedagogy" },
  { href: "/dashboard/competencias", label: "Competências", Icon: ChartNoAxesColumnIncreasing, module: "pedagogy" },
  { href: "/dashboard/intervencoes", label: "Intervenções", Icon: TriangleAlert, module: "pedagogy" },
  { href: "/dashboard/risco-academico", label: "Risco acadêmico", Icon: TriangleAlert, module: "pedagogy" },
  { href: "/dashboard/evolucao", label: "Evolução", Icon: GraduationCap, module: "pedagogy" },

  { href: "/dashboard/banco-questoes", label: "Banco de questões", Icon: NotebookTabs, module: "assessments" },
  { href: "/dashboard/provas", label: "Provas online", Icon: ClipboardCheck, module: "assessments" },
  { href: "/dashboard/correcoes", label: "Correções", Icon: BookOpenCheck, module: "assessments" },
  { href: "/dashboard/analise-habilidades", label: "Análise por habilidade", Icon: ChartNoAxesColumnIncreasing, module: "assessments" },
  { href: "/dashboard/rubricas-aplicadas", label: "Rubricas aplicadas", Icon: ClipboardCheck, module: "assessments" },
  { href: "/dashboard/blueprints", label: "Blueprints de prova", Icon: ClipboardCheck, module: "assessments" },
  { href: "/dashboard/desempenho-provas", label: "Desempenho em provas", Icon: ChartNoAxesColumnIncreasing, module: "assessments" },
  { href: "/dashboard/recuperacoes-avaliacoes", label: "Recuperações de prova", Icon: ChartNoAxesColumnIncreasing, module: "assessments" },
  { href: "/dashboard/segunda-chamada", label: "Segunda chamada", Icon: ClipboardCheck, module: "assessments" },
  { href: "/dashboard/revisoes-provas", label: "Revisões de prova", Icon: BookOpenCheck, module: "assessments" },
  { href: "/dashboard/integridade-provas", label: "Integridade de provas", Icon: TriangleAlert, module: "assessments" },
  { href: "/dashboard/evolucao-avaliacoes", label: "Evolução em avaliações", Icon: ChartNoAxesColumnIncreasing, module: "assessments" },

  { href: "/dashboard/configuracoes", label: "Configurações", Icon: FileText, roles: ["SCHOOL_ADMIN", "COORDINATOR"] },
];

export async function DashboardNav() {
  const user = await requireUser();
  const org = await activeOrganization();

  const roles = new Set(
    user.memberships
      .filter((membership) => membership.organizationId === org?.id)
      .map((membership) => membership.role as SchoolRole),
  );

  const modules = items
    .map((item) => item.module)
    .filter((module): module is string => Boolean(module));

  const allowedModules = await getAllowedModules(modules, "view");

  const visibleItems = items.filter((item) => {
    if (!item.module && !item.roles) return true;

    if (item.roles) {
      return item.roles.some((role) => roles.has(role));
    }

    return item.module ? allowedModules.has(item.module) : false;
  });

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="logo">
          <BookOpenCheck size={20} />
        </span>
        ClassDiary
      </Link>

      {visibleItems.map(({ href, label, Icon }) => (
        <Link className="side-link" href={href} key={href}>
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </aside>
  );
}

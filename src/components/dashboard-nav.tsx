import Link from "next/link";
import {BookOpenCheck,CalendarDays,ClipboardCheck,GraduationCap,LayoutDashboard,School,Users,Layers3,FileText,ChartNoAxesColumnIncreasing,Megaphone,TriangleAlert,UserPlus,NotebookTabs,Landmark,Files} from "lucide-react";
const items=[
["/dashboard","Visão geral",LayoutDashboard],
["/dashboard/alunos","Alunos",GraduationCap],
["/dashboard/turmas","Turmas",School],
["/dashboard/matriculas","Matrículas",Layers3],
["/dashboard/professores","Professores",Users],
["/dashboard/convites","Convites",UserPlus],
["/dashboard/disciplinas","Disciplinas",FileText],
["/dashboard/diarios","Diário de classe",BookOpenCheck],
["/dashboard/frequencia","Frequência",ClipboardCheck],
["/dashboard/notas","Notas",ChartNoAxesColumnIncreasing],
["/dashboard/boletins","Boletins",FileText],
["/dashboard/ocorrencias","Ocorrências",TriangleAlert],
["/dashboard/calendario","Calendário",CalendarDays],
["/dashboard/comunicados","Comunicados",Megaphone],["/dashboard/atividades","Atividades",NotebookTabs],["/dashboard/recuperacao","Recuperação",ChartNoAxesColumnIncreasing],["/dashboard/conselho","Conselho",Landmark],["/dashboard/historico","Histórico",Files],["/dashboard/documentos","Documentos",FileText]
] as const;
export function DashboardNav(){return <aside className="sidebar"><Link href="/" className="brand"><span className="logo"><BookOpenCheck size={20}/></span>ClassDiary</Link>{items.map(([href,label,Icon])=><Link className="side-link" href={href} key={href}><Icon size={18}/>{label}</Link>)}</aside>}

import Link from "next/link";
import {BookOpenCheck,ClipboardCheck,GraduationCap,LayoutDashboard,School,Users,Layers3,FileText,ChartNoAxesColumnIncreasing} from "lucide-react";
const items=[
["/dashboard","Visão geral",LayoutDashboard],
["/dashboard/alunos","Alunos",GraduationCap],
["/dashboard/turmas","Turmas",School],
["/dashboard/matriculas","Matrículas",Layers3],
["/dashboard/professores","Professores",Users],
["/dashboard/disciplinas","Disciplinas",FileText],
["/dashboard/diarios","Diário de classe",BookOpenCheck],
["/dashboard/frequencia","Frequência",ClipboardCheck],
["/dashboard/notas","Notas",ChartNoAxesColumnIncreasing]
] as const;
export function DashboardNav(){return <aside className="sidebar"><Link href="/" className="brand"><span className="logo"><BookOpenCheck size={20}/></span>ClassDiary</Link>{items.map(([href,label,Icon])=><Link className="side-link" href={href} key={href}><Icon size={18}/>{label}</Link>)}</aside>}

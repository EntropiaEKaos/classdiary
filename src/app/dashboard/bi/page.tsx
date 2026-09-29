import Link from "next/link";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("bi","view");
  const [students,classes,grades,attendance,leads,invoices,payments,expenses,employees,tickets,surveys]=await Promise.all([
    db.student.count({where:{organizationId:org.id,active:true}}),
    db.classGroup.count({where:{organizationId:org.id}}),
    db.grade.findMany({where:{student:{organizationId:org.id}}}),
    db.attendance.findMany({where:{student:{organizationId:org.id}}}),
    db.enrollmentLead.findMany({where:{organizationId:org.id}}),
    db.invoice.findMany({where:{organizationId:org.id}}),
    db.payment.findMany({where:{organizationId:org.id}}),
    db.expense.findMany({where:{organizationId:org.id,status:"PAID"}}),
    db.employee.count({where:{organizationId:org.id,active:true}}),
    db.maintenanceTicket.count({where:{organizationId:org.id,status:{not:"CLOSED"}}}),
    db.surveyResponse.findMany({where:{organizationId:org.id},select:{score:true}})
  ]);

  const gradeValues=grades.map(g=>(Number(g.value)/Number(g.maxValue))*10);
  const avgGrade=gradeValues.length?gradeValues.reduce((a,b)=>a+b,0)/gradeValues.length:0;
  const present=attendance.filter(a=>["PRESENT","LATE","EXCUSED"].includes(a.status)).length;
  const freq=attendance.length?(present/attendance.length)*100:100;
  const converted=leads.filter(l=>l.status==="CONVERTED").length;
  const conversion=leads.length?(converted/leads.length)*100:0;
  const revenue=payments.reduce((s,p)=>s+Number(p.amount),0);
  const expense=expenses.reduce((s,e)=>s+Number(e.amount),0);
  const receivable=invoices.filter(i=>i.status!=="PAID").reduce((s,i)=>s+Number(i.amount)-Number(i.discountAmount)+Number(i.fineAmount)+Number(i.interestAmount),0);
  const scores=surveys.map(s=>s.score).filter((x):x is number=>x!==null);
  const nps=scores.length?((scores.filter(x=>x>=9).length-scores.filter(x=>x<=6).length)/scores.length)*100:0;

  return <main className="main">
    <div className="page-head"><div><h1>BI executivo</h1><div className="muted">Indicadores consolidados do tenant em uma visão única.</div></div><Link href="/api/export/bi" className="btn btn-light">Exportar CSV</Link></div>
    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Alunos</span><div className="value">{students}</div></div>
      <div className="kpi"><span className="muted">Turmas</span><div className="value">{classes}</div></div>
      <div className="kpi"><span className="muted">Média acadêmica</span><div className="value">{avgGrade.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">Frequência</span><div className="value">{freq.toFixed(1)}%</div></div>
    </div>
    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Conversão CRM</span><div className="value">{conversion.toFixed(1)}%</div></div>
      <div className="kpi"><span className="muted">NPS</span><div className="value">{nps.toFixed(0)}</div></div>
      <div className="kpi"><span className="muted">Receita histórica</span><div className="value">R$ {revenue.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">A receber</span><div className="value">R$ {receivable.toFixed(2)}</div></div>
    </div>
    <section className="table-card" style={{marginTop:16}}>
      <h3>Operação consolidada</h3>
      <div className="table-row"><strong>Resultado financeiro registrado</strong><span>R$ {(revenue-expense).toFixed(2)}</span></div>
      <div className="table-row"><strong>Colaboradores ativos</strong><span>{employees}</span></div>
      <div className="table-row"><strong>Chamados de manutenção abertos</strong><span>{tickets}</span></div>
      <div className="table-row"><strong>Leads totais / convertidos</strong><span>{leads.length} / {converted}</span></div>
      <div className="table-row"><strong>Respostas de qualidade</strong><span>{scores.length}</span></div>
    </section>
  </main>;
}

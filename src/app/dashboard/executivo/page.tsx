import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR"]);
  const now=new Date();const monthStart=new Date(now.getFullYear(),now.getMonth(),1);const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);

  const [students,teachers,employees,alerts,received,expenses,overdue,leads,assets,lowStock,loans,transport,canteen]=await Promise.all([
    db.student.count({where:{organizationId:org.id,active:true}}),
    db.membership.count({where:{organizationId:org.id,role:"TEACHER"}}),
    db.employee.count({where:{organizationId:org.id,active:true}}),
    db.student.findMany({where:{organizationId:org.id,active:true},include:{grades:true,attendance:true}}),
    db.payment.aggregate({where:{organizationId:org.id,paidAt:{gte:monthStart,lt:monthEnd}},_sum:{amount:true}}),
    db.expense.aggregate({where:{organizationId:org.id,paidAt:{gte:monthStart,lt:monthEnd}},_sum:{amount:true}}),
    db.invoice.count({where:{organizationId:org.id,status:"OVERDUE"}}),
    db.enrollmentLead.count({where:{organizationId:org.id,status:{in:["PRE_ENROLLMENT","WAITLIST","APPROVED"]}}}),
    db.asset.count({where:{organizationId:org.id,status:"ACTIVE"}}),
    db.inventoryItem.findMany({where:{organizationId:org.id,active:true}}),
    db.libraryLoan.count({where:{organizationId:org.id,status:"BORROWED"}}),
    db.transportAssignment.count({where:{organizationId:org.id,active:true}}),
    db.canteenOrder.aggregate({where:{organizationId:org.id,createdAt:{gte:monthStart,lt:monthEnd},status:"PAID"},_sum:{totalAmount:true}})
  ]);

  const academicAlerts=alerts.filter(s=>{
    const total=s.attendance.length;const present=s.attendance.filter(a=>a.status==="PRESENT"||a.status==="LATE"||a.status==="EXCUSED").length;
    const attendance=total?(present/total)*100:100;
    const w=s.grades.reduce((sum,g)=>sum+Number(g.weight),0);
    const avg=w?s.grades.reduce((sum,g)=>sum+((Number(g.value)/Number(g.maxValue))*10)*Number(g.weight),0)/w:10;
    return attendance<org.attendanceWarningPercent||(s.grades.length>0&&avg<Number(org.passingGrade));
  }).length;

  const low=lowStock.filter(i=>Number(i.quantity)<=Number(i.minQuantity)).length;
  const income=Number(received._sum.amount??0)+Number(canteen._sum.totalAmount??0);
  const expense=Number(expenses._sum.amount??0);

  return <main className="main"><div className="page-head"><div><h1>Visão executiva</h1><div className="muted">Resumo consolidado acadêmico, financeiro e operacional.</div></div></div>
    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Alunos</span><div className="value">{students}</div></div>
      <div className="kpi"><span className="muted">Alertas acadêmicos</span><div className="value">{academicAlerts}</div></div>
      <div className="kpi"><span className="muted">Receita do mês</span><div className="value">R$ {income.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">Resultado do mês</span><div className="value">R$ {(income-expense).toFixed(2)}</div></div>
    </div>
    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Professores</span><div className="value">{teachers}</div></div>
      <div className="kpi"><span className="muted">Colaboradores</span><div className="value">{employees}</div></div>
      <div className="kpi"><span className="muted">Inadimplentes</span><div className="value">{overdue}</div></div>
      <div className="kpi"><span className="muted">Leads ativos</span><div className="value">{leads}</div></div>
    </div>
    <section className="table-card" style={{marginTop:16}}><h3>Operação</h3>
      <div className="table-row"><strong>Patrimônio ativo</strong><span>{assets} bens</span></div>
      <div className="table-row"><strong>Estoque em alerta</strong><span>{low} itens no mínimo</span></div>
      <div className="table-row"><strong>Biblioteca</strong><span>{loans} empréstimos ativos</span></div>
      <div className="table-row"><strong>Transporte</strong><span>{transport} alunos atendidos</span></div>
      <div className="table-row"><strong>Cantina no mês</strong><span>R$ {Number(canteen._sum.totalAmount??0).toFixed(2)}</span></div>
    </section>
  </main>;
}

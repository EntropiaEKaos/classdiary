import Link from "next/link";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","SECRETARY"]);
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);

  const [open,overdue,paidMonth,receivedMonth,recent]=await Promise.all([
    db.invoice.count({where:{organizationId:org.id,status:"OPEN"}}),
    db.invoice.count({where:{organizationId:org.id,status:"OVERDUE"}}),
    db.invoice.count({where:{organizationId:org.id,status:"PAID",paidAt:{gte:monthStart,lt:monthEnd}}}),
    db.payment.aggregate({where:{organizationId:org.id,paidAt:{gte:monthStart,lt:monthEnd}},_sum:{amount:true}}),
    db.invoice.findMany({where:{organizationId:org.id},include:{student:true,payments:true},orderBy:{dueAt:"desc"},take:20})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Financeiro escolar</h1><div className="muted">Cobranças, recebimentos e inadimplência da instituição.</div></div>
      <div className="top-actions">
        <Link className="btn btn-light" href="/dashboard/financeiro/contratos">Contratos</Link>
        <Link className="btn btn-light" href="/dashboard/financeiro/cobrancas">Cobranças</Link>
        <Link className="btn btn-light" href="/dashboard/financeiro/dre">DRE</Link><Link className="btn btn-light" href="/dashboard/financeiro/configuracoes">Configurações</Link>
      </div>
    </div>

    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Cobranças abertas</span><div className="value">{open}</div></div>
      <div className="kpi"><span className="muted">Em atraso</span><div className="value">{overdue}</div></div>
      <div className="kpi"><span className="muted">Pagas no mês</span><div className="value">{paidMonth}</div></div>
      <div className="kpi"><span className="muted">Recebido no mês</span><div className="value">R$ {Number(receivedMonth._sum.amount??0).toFixed(2)}</div></div>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Cobranças recentes</h3>
      {recent.length===0?<p className="muted">Nenhuma cobrança registrada.</p>:recent.map(i=>{
        const paid=i.payments.reduce((sum,p)=>sum+Number(p.amount),0);
        const total=Number(i.amount)-Number(i.discountAmount)+Number(i.fineAmount)+Number(i.interestAmount);
        return <div className="table-row" key={i.id}><strong>{i.student.name} · {i.description}</strong><span>R$ {paid.toFixed(2)} / {total.toFixed(2)}</span><span>{i.status}</span></div>;
      })}
    </section>
  </main>;
}

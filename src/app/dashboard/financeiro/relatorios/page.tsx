import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "short" });

export default async function Page(){
  const {org}=await requireModulePermission("finance","view");
  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth()-11,1);
  const end=new Date(now.getFullYear(),now.getMonth()+1,1);

  const [payments,revenues,expenses,openInvoices]=await Promise.all([
    db.payment.findMany({where:{organizationId:org.id,paidAt:{gte:start,lt:end}},select:{amount:true,paidAt:true}}),
    db.revenue.findMany({where:{organizationId:org.id,receivedAt:{gte:start,lt:end}},select:{amount:true,receivedAt:true}}),
    db.expense.findMany({where:{organizationId:org.id,paidAt:{gte:start,lt:end}},select:{amount:true,paidAt:true}}),
    db.invoice.findMany({where:{organizationId:org.id,status:{in:["OPEN","OVERDUE"]}},select:{amount:true,discountAmount:true,fineAmount:true,interestAmount:true,dueAt:true}})
  ]);

  const months=Array.from({length:12},(_,index)=>{
    const date=new Date(now.getFullYear(),now.getMonth()-11+index,1);
    const key=`${date.getFullYear()}-${date.getMonth()}`;
    return {key,date,revenue:0,expense:0,result:0};
  });

  const map=new Map(months.map(m=>[m.key,m]));

  for(const payment of payments){
    const key=`${payment.paidAt.getFullYear()}-${payment.paidAt.getMonth()}`;
    const item=map.get(key); if(item) item.revenue+=Number(payment.amount);
  }

  for(const revenue of revenues){
    const key=`${revenue.receivedAt.getFullYear()}-${revenue.receivedAt.getMonth()}`;
    const item=map.get(key); if(item) item.revenue+=Number(revenue.amount);
  }

  for(const expense of expenses){
    if(!expense.paidAt) continue;
    const key=`${expense.paidAt.getFullYear()}-${expense.paidAt.getMonth()}`;
    const item=map.get(key); if(item) item.expense+=Number(expense.amount);
  }

  for(const item of months) item.result=item.revenue-item.expense;

  const totalRevenue=months.reduce((s,m)=>s+m.revenue,0);
  const totalExpense=months.reduce((s,m)=>s+m.expense,0);
  const totalResult=totalRevenue-totalExpense;
  const receivable=openInvoices.reduce((sum,i)=>sum+Number(i.amount)-Number(i.discountAmount)+Number(i.fineAmount)+Number(i.interestAmount),0);
  const max=Math.max(1,...months.flatMap(m=>[m.revenue,m.expense]));

  return <main className="main">
    <div className="page-head">
      <div>
        <h1>Relatórios financeiros</h1>
        <div className="muted">Últimos 12 meses: receitas, despesas, resultado e valores a receber.</div>
      </div>
    </div>

    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Receita 12 meses</span><div className="value">R$ {totalRevenue.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">Despesa 12 meses</span><div className="value">R$ {totalExpense.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">Resultado</span><div className="value">R$ {totalResult.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">A receber</span><div className="value">R$ {receivable.toFixed(2)}</div></div>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Receitas x despesas</h3>
      <div className="finance-chart">
        {months.map(m=><div className="finance-chart-month" key={m.key}>
          <div className="finance-bars">
            <div className="finance-bar income" style={{height:`${Math.max(2,(m.revenue/max)*180)}px`}} title={`Receita R$ ${m.revenue.toFixed(2)}`} />
            <div className="finance-bar expense" style={{height:`${Math.max(2,(m.expense/max)*180)}px`}} title={`Despesa R$ ${m.expense.toFixed(2)}`} />
          </div>
          <strong>{monthLabel.format(m.date)}</strong>
          <small className={m.result>=0?"positive":"negative"}>R$ {m.result.toFixed(0)}</small>
        </div>)}
      </div>
      <div className="muted">Barras: receita e despesa. Valor abaixo do mês: resultado líquido.</div>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Detalhamento mensal</h3>
      {months.slice().reverse().map(m=><div className="table-row" key={m.key}>
        <strong>{monthLabel.format(m.date)} {m.date.getFullYear()}</strong>
        <span>Receita R$ {m.revenue.toFixed(2)} · Despesa R$ {m.expense.toFixed(2)}</span>
        <span className={m.result>=0?"positive":"negative"}>R$ {m.result.toFixed(2)}</span>
      </div>)}
    </section>
  </main>;
}

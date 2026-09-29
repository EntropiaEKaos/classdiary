import { applyOverdueChargesAction, registerPaymentAction } from "@/app/actions/finance";
import { generateInvoicesBatchAction } from "@/app/actions/enrollment-finance";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","SECRETARY"]);
  const rows=await db.invoice.findMany({
    where:{organizationId:org.id},
    include:{student:true,payments:true,receipts:true},
    orderBy:[{status:"asc"},{dueAt:"asc"}],
    take:500
  });

  return <main className="main"><div className="page-head"><div><h1>Cobranças</h1><div className="muted">Mensalidades, baixa de pagamento e inadimplência.</div></div></div><section className="table-card"><h3>Gerar mensalidades em lote</h3><form action={generateInvoicesBatchAction} className="form-grid compact"><input name="month" type="number" min="1" max="12" defaultValue={new Date().getMonth()+1}/><input name="year" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear()}/><button className="btn btn-primary">Gerar para contratos ativos</button></form></section>
    {rows.length===0?<section className="table-card"><p className="muted">Nenhuma cobrança gerada.</p></section>:rows.map(i=>{
      const paid=i.payments.reduce((sum,p)=>sum+Number(p.amount),0);
      const total=Number(i.amount)-Number(i.discountAmount)+Number(i.fineAmount)+Number(i.interestAmount);
      const remaining=Math.max(0,total-paid);
      return <section className="table-card" style={{marginBottom:16}} key={i.id}>
        <div className="page-head" style={{marginBottom:8}}><div><h3>{i.student.name} · {i.description}</h3><div className="muted">Vencimento {i.dueAt.toLocaleDateString("pt-BR")} · Ref. {i.reference}</div></div><span className="status">{i.status}</span></div>
        <div className="table-row"><strong>Total</strong><span>Pago R$ {paid.toFixed(2)}</span><span>Saldo R$ {remaining.toFixed(2)}</span></div>
        {i.status!=="PAID"?<div className="content-grid">
          <form action={registerPaymentAction} className="form-stack">
            <input type="hidden" name="invoiceId" value={i.id}/>
            <input name="amount" type="number" step=".01" min=".01" max={remaining.toFixed(2)} defaultValue={remaining.toFixed(2)}/>
            <select name="method"><option value="PIX">Pix</option><option value="CASH">Dinheiro</option><option value="CARD">Cartão</option><option value="TRANSFER">Transferência</option><option value="OTHER">Outro</option></select>
            <input name="externalReference" placeholder="Referência externa"/>
            <input name="notes" placeholder="Observações"/>
            <button className="btn btn-primary">Registrar pagamento</button>
          </form>
          {i.dueAt<new Date()&&i.status==="OPEN"?<form action={applyOverdueChargesAction} className="form-stack"><input type="hidden" name="invoiceId" value={i.id}/><button className="btn btn-light">Aplicar encargos de atraso</button></form>:null}
        </div>:null}
        {i.receipts.length?<div style={{marginTop:12}}>{i.receipts.map(r=><a key={r.id} className="btn btn-light" href={"/api/recibos/"+r.id} target="_blank">Recibo {r.number}</a>)}</div>:null}
      </section>;
    })}
  </main>;
}

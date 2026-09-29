import { createStudentContractAction, generateMonthlyInvoiceAction } from "@/app/actions/finance";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","SECRETARY"]);
  const [students,contracts]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.studentContract.findMany({where:{organizationId:org.id},include:{student:true},orderBy:{createdAt:"desc"},take:200})
  ]);
  const now=new Date();

  return <main className="main">
    <div className="page-head"><div><h1>Contratos e mensalidades</h1><div className="muted">Valores, bolsas, descontos e geração de cobranças.</div></div></div>

    <section className="table-card">
      <h3>Novo contrato</h3>
      <form action={createStudentContractAction} className="form-grid">
        <select name="studentId">{students.map(s=><option value={s.id} key={s.id}>{s.name} · {s.registration}</option>)}</select>
        <input name="title" required placeholder="Contrato 2026"/>
        <input name="startsAt" type="date" required/>
        <input name="endsAt" type="date"/>
        <input name="monthlyAmount" type="number" step=".01" min=".01" required placeholder="Mensalidade"/>
        <select name="discountType"><option value="NONE">Sem desconto</option><option value="PERCENT">Percentual</option><option value="FIXED">Valor fixo</option></select>
        <input name="discountValue" type="number" step=".01" min="0" placeholder="Desconto"/>
        <input name="scholarshipLabel" placeholder="Bolsa / convênio"/>
        <input name="notes" placeholder="Observações"/>
        <button className="btn btn-primary">Criar contrato</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Contratos</h3>
      {contracts.map(c=><div className="notice" key={c.id}>
        <strong>{c.student.name} · {c.title}</strong>
        <div className="muted">R$ {Number(c.monthlyAmount).toFixed(2)} · {c.scholarshipLabel??"Sem bolsa"} · {c.status}</div>
        <form action={generateMonthlyInvoiceAction} className="form-grid compact" style={{marginTop:8}}>
          <input type="hidden" name="contractId" value={c.id}/>
          <input name="month" type="number" min="1" max="12" defaultValue={now.getMonth()+1}/>
          <input name="year" type="number" min="2000" max="2100" defaultValue={now.getFullYear()}/>
          <button className="btn btn-light">Gerar mensalidade</button>
        </form>
      </div>)}
    </section>
  </main>;
}

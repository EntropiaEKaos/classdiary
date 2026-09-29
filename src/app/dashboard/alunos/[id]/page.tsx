import { notFound } from "next/navigation";
import { updateStudentProfileAction, upsertStudentDocumentAction } from "@/app/actions/secretary";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);
  const {id}=await params;

  const student=await db.student.findFirst({
    where:{id,organizationId:org.id},
    include:{
      enrollments:{include:{classGroup:{include:{schoolYear:true}}},orderBy:{createdAt:"desc"}},
      documents:true,
      documentRequirements:true,
      academicMovements:{include:{fromClassGroup:true,toClassGroup:true},orderBy:{effectiveAt:"desc"}},
      annualResults:{include:{schoolYear:true},orderBy:{createdAt:"desc"}},
      contracts:true,
      invoices:{include:{payments:true},orderBy:{dueAt:"desc"},take:50},
      receipts:{orderBy:{issuedAt:"desc"},take:20},
    },
  });
  if(!student) notFound();

  return <main className="main">
    <div className="page-head"><div><h1>{student.name}</h1><div className="muted">Matrícula {student.registration}</div></div><a className="btn btn-light" href={"/dashboard/evolucao/"+student.id}>Evolução pedagógica</a></div>

    <section className="table-card">
      <h3>Ficha cadastral</h3>
      <form action={updateStudentProfileAction} className="form-grid">
        <input type="hidden" name="studentId" value={student.id}/>
        <input name="birthDate" type="date" defaultValue={student.birthDate?student.birthDate.toISOString().slice(0,10):""}/>
        <input name="cpf" placeholder="CPF" defaultValue={student.cpf??""}/>
        <input name="rg" placeholder="RG" defaultValue={student.rg??""}/>
        <input name="guardianName" placeholder="Responsável" defaultValue={student.guardianName??""}/>
        <input name="guardianPhone" placeholder="Telefone responsável" defaultValue={student.guardianPhone??""}/>
        <input name="guardianEmail" type="email" placeholder="E-mail responsável" defaultValue={student.guardianEmail??""}/>
        <input name="addressLine" placeholder="Endereço" defaultValue={student.addressLine??""}/>
        <input name="addressNumber" placeholder="Número" defaultValue={student.addressNumber??""}/>
        <input name="addressDistrict" placeholder="Bairro" defaultValue={student.addressDistrict??""}/>
        <input name="addressCity" placeholder="Cidade" defaultValue={student.addressCity??""}/>
        <input name="addressState" placeholder="UF" defaultValue={student.addressState??""}/>
        <input name="addressZip" placeholder="CEP" defaultValue={student.addressZip??""}/>
        <input name="emergencyContactName" placeholder="Contato de emergência" defaultValue={student.emergencyContactName??""}/>
        <input name="emergencyContactPhone" placeholder="Telefone emergência" defaultValue={student.emergencyContactPhone??""}/>
        <input name="healthNotes" placeholder="Observações de saúde" defaultValue={student.healthNotes??""}/>
        <button className="btn btn-primary">Salvar ficha</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Documentos obrigatórios</h3>
      <form action={upsertStudentDocumentAction} className="form-grid compact">
        <input type="hidden" name="studentId" value={student.id}/>
        <input name="code" required placeholder="Ex.: RG"/>
        <input name="label" required placeholder="Nome do documento"/>
        <select name="status"><option value="PENDING">Pendente</option><option value="RECEIVED">Recebido</option><option value="WAIVED">Dispensado</option></select>
        <input name="fileUrl" type="url" placeholder="Link do arquivo"/>
        <input name="notes" placeholder="Observação"/>
        <button className="btn btn-primary">Salvar documento</button>
      </form>
      {student.documentRequirements.map(d=><div className="table-row" key={d.id}><strong>{d.label}</strong><span>{d.status}</span><span>{d.receivedAt?d.receivedAt.toLocaleDateString("pt-BR"):"—"}</span></div>)}
    </section>

    <div className="content-grid">
      <section className="table-card">
        <h3>Matrículas</h3>
        {student.enrollments.map(e=><div className="notice" key={e.id}><strong>{e.classGroup.schoolYear.name} · {e.classGroup.name}</strong><div className="muted">{e.active?"Ativa":"Encerrada"}</div></div>)}
      </section>
      <section className="table-card">
        <h3>Resultados anuais</h3>
        {student.annualResults.map(r=><div className="notice" key={r.id}><strong>{r.schoolYear.name} · {r.status}</strong><div className="muted">Média {r.finalAverage?String(r.finalAverage):"—"} · Freq. {r.attendancePercent?String(r.attendancePercent):"—"}%</div></div>)}
      </section>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Resumo financeiro</h3>
      <div className="dashboard-grid">
        <div className="kpi"><span className="muted">Contratos</span><div className="value">{student.contracts.length}</div></div>
        <div className="kpi"><span className="muted">Cobranças abertas</span><div className="value">{student.invoices.filter(i=>i.status!=="PAID").length}</div></div>
        <div className="kpi"><span className="muted">Recibos</span><div className="value">{student.receipts.length}</div></div>
        <div className="kpi"><span className="muted">Saldo em aberto</span><div className="value">R$ {student.invoices.filter(i=>i.status!=="PAID").reduce((sum,i)=>sum+Math.max(0,(Number(i.amount)-Number(i.discountAmount)+Number(i.fineAmount)+Number(i.interestAmount))-i.payments.reduce((s,p)=>s+Number(p.amount),0)),0).toFixed(2)}</div></div>
      </div>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Movimentações acadêmicas</h3>
      {student.academicMovements.map(m=><div className="table-row" key={m.id}><strong>{m.type}</strong><span>{m.fromClassGroup?.name??"—"} → {m.toClassGroup?.name??"—"}</span><span>{m.effectiveAt.toLocaleDateString("pt-BR")}</span></div>)}
    </section>
  </main>;
}

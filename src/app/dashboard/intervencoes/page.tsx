import { closePedagogicalInterventionAction, createPedagogicalInterventionAction } from "@/app/actions/pedagogy";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("pedagogy","view");
  const [students,classes,rows]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.classGroup.findMany({where:{organizationId:org.id},orderBy:{name:"asc"}}),
    db.pedagogicalIntervention.findMany({where:{organizationId:org.id},include:{student:true,classGroup:true,createdBy:true},orderBy:{startsAt:"desc"},take:300})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Intervenções pedagógicas</h1><div className="muted">Planos individuais de apoio e acompanhamento.</div></div></div>
    <section className="table-card">
      <form action={createPedagogicalInterventionAction} className="form-grid">
        <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="classGroupId"><option value="">Sem turma específica</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input name="reason" required placeholder="Motivo da intervenção"/>
        <input name="plan" required placeholder="Plano de ação"/>
        <input name="startsAt" type="date"/>
        <input name="endsAt" type="date"/>
        <button className="btn btn-primary">Criar intervenção</button>
      </form>
    </section>

    {rows.map(r=><section className="table-card" style={{marginTop:16}} key={r.id}>
      <div className="page-head" style={{marginBottom:8}}><div><h3>{r.student.name}</h3><div className="muted">{r.classGroup?.name??"Sem turma"} · {r.createdBy.name}</div></div><span className="status">{r.status}</span></div>
      <p><strong>Motivo:</strong> {r.reason}</p>
      <p><strong>Plano:</strong> {r.plan}</p>
      {r.status==="ACTIVE"?<form action={closePedagogicalInterventionAction} className="form-grid compact"><input type="hidden" name="id" value={r.id}/><input name="outcome" required placeholder="Resultado/encaminhamento"/><button className="btn btn-light">Concluir intervenção</button></form>:<p><strong>Resultado:</strong> {r.outcome}</p>}
    </section>)}
  </main>;
}

import { reenrollStudentAction, transferStudentAction } from "@/app/actions/secretary";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);
  const [students,classes,movements]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.classGroup.findMany({where:{organizationId:org.id},include:{schoolYear:true},orderBy:[{schoolYear:{name:"desc"}},{name:"asc"}]}),
    db.academicMovement.findMany({where:{organizationId:org.id},include:{student:true,fromClassGroup:true,toClassGroup:true},orderBy:{effectiveAt:"desc"},take:100})
  ]);

  return <main className="main"><div className="page-head"><div><h1>Rematrícula e transferências</h1><div className="muted">Movimente alunos entre turmas mantendo histórico.</div></div></div>
    <div className="content-grid">
      <section className="table-card"><h3>Rematricular</h3><form action={reenrollStudentAction} className="form-stack">
        <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.registration}</option>)}</select>
        <select name="classGroupId">{classes.map(c=><option key={c.id} value={c.id}>{c.schoolYear.name} · {c.name}</option>)}</select>
        <button className="btn btn-primary">Rematricular</button>
      </form></section>
      <section className="table-card"><h3>Transferir turma</h3><form action={transferStudentAction} className="form-stack">
        <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.registration}</option>)}</select>
        <select name="toClassGroupId">{classes.map(c=><option key={c.id} value={c.id}>{c.schoolYear.name} · {c.name}</option>)}</select>
        <input name="notes" placeholder="Observação da transferência"/>
        <button className="btn btn-primary">Transferir</button>
      </form></section>
    </div>
    <section className="table-card" style={{marginTop:16}}><h3>Histórico de movimentações</h3>{movements.map(m=><div className="table-row" key={m.id}><strong>{m.student.name} · {m.type}</strong><span>{m.fromClassGroup?.name??"—"} → {m.toClassGroup?.name??"—"}</span><span>{m.effectiveAt.toLocaleDateString("pt-BR")}</span></div>)}</section>
  </main>;
}

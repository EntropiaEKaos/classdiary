import { assessCompetencyAction } from "@/app/actions/pedagogy";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {user,org}=await requireModulePermission("pedagogy","view");
  const membership=user.memberships.find(m=>m.organizationId===org.id);
  const teacherOnly=membership?.role==="TEACHER";
  const [students,competencies,subjects,classes,rows]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true,...(teacherOnly?{enrollments:{some:{active:true,classGroup:{classSubjects:{some:{teacherId:user.id}}}}}}:{})},orderBy:{name:"asc"}}),
    db.curriculumCompetency.findMany({where:{organizationId:org.id},orderBy:{code:"asc"}}),
    db.subject.findMany({where:{organizationId:org.id,...(teacherOnly?{classSubjects:{some:{teacherId:user.id}}}:{})},orderBy:{name:"asc"}}),
    db.classGroup.findMany({where:{organizationId:org.id,...(teacherOnly?{classSubjects:{some:{teacherId:user.id}}}:{})},orderBy:{name:"asc"}}),
    db.competencyAssessment.findMany({where:{organizationId:org.id,...(teacherOnly?{authorId:user.id}:{})},include:{student:true,competency:true,subject:true},orderBy:{assessedAt:"desc"},take:300})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Avaliação por competências</h1><div className="muted">Evidências de aprendizagem além da nota numérica.</div></div></div>
    <section className="table-card">
      <form action={assessCompetencyAction} className="form-grid">
        <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="competencyId">{competencies.map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
        <select name="subjectId"><option value="">Sem disciplina</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="classGroupId"><option value="">Sem turma</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="level"><option value="NOT_STARTED">Não iniciado</option><option value="DEVELOPING">Em desenvolvimento</option><option value="PROFICIENT">Proficiente</option><option value="ADVANCED">Avançado</option></select>
        <input name="score" type="number" step=".01" min="0" max="10" placeholder="Pontuação opcional"/>
        <input name="evidence" placeholder="Evidência observada"/>
        <button className="btn btn-primary">Registrar avaliação</button>
      </form>
    </section>
    <section className="table-card" style={{marginTop:16}}>{rows.map(r=><div className="table-row" key={r.id}><strong>{r.student.name} · {r.competency.code}</strong><span>{r.level} · {r.subject?.name??"Interdisciplinar"}</span><span>{r.score?String(r.score):"—"}</span></div>)}</section>
  </main>;
}

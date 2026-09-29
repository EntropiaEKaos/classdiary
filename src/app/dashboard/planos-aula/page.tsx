import { createLessonPlanAction } from "@/app/actions/pedagogy";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {user,org}=await requireModulePermission("pedagogy","view");
  const membership=user.memberships.find(m=>m.organizationId===org.id);
  const teacherOnly=membership?.role==="TEACHER";
  const [classes,subjects,competencies,plans]=await Promise.all([
    db.classGroup.findMany({where:{organizationId:org.id,...(teacherOnly?{classSubjects:{some:{teacherId:user.id}}}:{})},orderBy:{name:"asc"}}),
    db.subject.findMany({where:{organizationId:org.id,...(teacherOnly?{classSubjects:{some:{teacherId:user.id}}}:{})},orderBy:{name:"asc"}}),
    db.curriculumCompetency.findMany({where:{organizationId:org.id},orderBy:{code:"asc"}}),
    db.lessonPlan.findMany({where:{organizationId:org.id,...(teacherOnly?{createdById:user.id}:{})},include:{classGroup:true,subject:true,competencies:{include:{competency:true}}},orderBy:{plannedDate:"desc"},take:200})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Planos de aula</h1><div className="muted">Planejamento estruturado e alinhado às competências.</div></div></div>
    <section className="table-card">
      <form action={createLessonPlanAction} className="form-grid">
        <select name="classGroupId">{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="subjectId">{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="competencyId"><option value="">Sem competência vinculada</option>{competencies.map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
        <input name="title" required placeholder="Tema da aula"/>
        <input name="objectives" required placeholder="Objetivos de aprendizagem"/>
        <input name="methodology" placeholder="Metodologia"/>
        <input name="resources" placeholder="Recursos"/>
        <input name="assessment" placeholder="Como será avaliada"/>
        <input name="plannedDate" type="date" required/>
        <button className="btn btn-primary">Criar plano</button>
      </form>
    </section>
    <section className="table-card" style={{marginTop:16}}>
      {plans.map(p=><div className="notice" key={p.id}><strong>{p.plannedDate.toLocaleDateString("pt-BR")} · {p.title}</strong><div className="muted">{p.classGroup.name} · {p.subject.name} · {p.status}</div><div>Objetivos: {p.objectives}</div>{p.competencies.length?<small>{p.competencies.map(c=>c.competency.code).join(", ")}</small>:null}</div>)}
    </section>
  </main>;
}

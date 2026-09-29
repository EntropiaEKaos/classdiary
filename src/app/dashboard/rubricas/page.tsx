import { createRubricAction } from "@/app/actions/pedagogy";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("pedagogy","view");
  const [subjects,competencies,rubrics]=await Promise.all([
    db.subject.findMany({where:{organizationId:org.id},orderBy:{name:"asc"}}),
    db.curriculumCompetency.findMany({where:{organizationId:org.id},orderBy:{code:"asc"}}),
    db.rubric.findMany({where:{organizationId:org.id,active:true},include:{subject:true,criteria:{include:{competencies:{include:{competency:true}}}}},orderBy:{name:"asc"}})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Rubricas</h1><div className="muted">Critérios de avaliação vinculados a competências.</div></div></div>
    <section className="table-card">
      <form action={createRubricAction} className="form-grid">
        <select name="subjectId"><option value="">Sem disciplina específica</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input name="name" required placeholder="Rubrica de produção textual"/>
        <input name="description" placeholder="Descrição"/>
        <input name="maxScore" type="number" step=".01" min=".01" defaultValue="10"/>
        <input name="criterionTitle" required placeholder="Critério inicial"/>
        <input name="criterionDescription" placeholder="Descrição do critério"/>
        <input name="criterionWeight" type="number" step=".01" min=".01" defaultValue="1"/>
        <select name="competencyId"><option value="">Sem competência vinculada</option>{competencies.map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
        <button className="btn btn-primary">Criar rubrica</button>
      </form>
    </section>
    <section className="table-card" style={{marginTop:16}}>
      {rubrics.map(r=><div className="notice" key={r.id}><strong>{r.name}</strong><div className="muted">{r.subject?.name??"Interdisciplinar"} · nota máxima {String(r.maxScore)}</div>{r.criteria.map(c=><div key={c.id}>{c.title} · peso {String(c.weight)}{c.competencies.length?" · "+c.competencies.map(x=>x.competency.code).join(", "):""}</div>)}</div>)}
    </section>
  </main>;
}

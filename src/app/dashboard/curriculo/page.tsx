import { addMatrixSubjectAction, createCurriculumCompetencyAction, createCurriculumFrameworkAction, createCurriculumMatrixAction } from "@/app/actions/pedagogy";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("curriculum","view");
  const [frameworks,competencies,matrices,subjects]=await Promise.all([
    db.curriculumFramework.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.curriculumCompetency.findMany({where:{organizationId:org.id},include:{framework:true},orderBy:[{gradeLevel:"asc"},{code:"asc"}]}),
    db.curriculumMatrix.findMany({where:{organizationId:org.id,active:true},include:{framework:true,subjects:{include:{subject:true}}},orderBy:{gradeLevel:"asc"}}),
    db.subject.findMany({where:{organizationId:org.id},orderBy:{name:"asc"}})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Currículo e matriz</h1><div className="muted">Referenciais, competências e carga horária por série.</div></div></div>

    <div className="content-grid">
      <section className="table-card">
        <h3>Novo referencial</h3>
        <form action={createCurriculumFrameworkAction} className="form-stack">
          <input name="name" required placeholder="BNCC / Currículo próprio"/>
          <input name="version" placeholder="Versão"/>
          <input name="source" placeholder="Fonte"/>
          <input name="description" placeholder="Descrição"/>
          <button className="btn btn-primary">Criar referencial</button>
        </form>
      </section>

      <section className="table-card">
        <h3>Nova competência/habilidade</h3>
        <form action={createCurriculumCompetencyAction} className="form-stack">
          <select name="frameworkId">{frameworks.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <input name="code" required placeholder="EF07MA01"/>
          <input name="title" required placeholder="Título da habilidade"/>
          <input name="description" placeholder="Descrição"/>
          <input name="gradeLevel" placeholder="7º Ano"/>
          <input name="subjectArea" placeholder="Matemática"/>
          <button className="btn btn-primary">Adicionar competência</button>
        </form>
      </section>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Nova matriz curricular</h3>
      <form action={createCurriculumMatrixAction} className="form-grid compact">
        <select name="frameworkId">{frameworks.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <input name="name" required placeholder="Matriz Fundamental II"/>
        <input name="gradeLevel" required placeholder="7º Ano"/>
        <input name="weeklyHours" type="number" min="1" placeholder="Horas semanais"/>
        <button className="btn btn-primary">Criar matriz</button>
      </form>
    </section>

    {matrices.map(m=><section className="table-card" style={{marginTop:16}} key={m.id}>
      <h3>{m.name} · {m.gradeLevel}</h3>
      <p className="muted">{m.framework.name} · {m.weeklyHours??"—"} horas semanais previstas</p>
      <form action={addMatrixSubjectAction} className="form-grid compact">
        <input type="hidden" name="matrixId" value={m.id}/>
        <select name="subjectId">{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input name="weeklyHours" type="number" min="1" required placeholder="Horas/semana"/>
        <input name="annualHours" type="number" min="1" placeholder="Horas/ano"/>
        <button className="btn btn-light">Vincular disciplina</button>
      </form>
      {m.subjects.map(ms=><div className="table-row" key={ms.id}><strong>{ms.subject.name}</strong><span>{ms.weeklyHours}h/semana</span><span>{ms.annualHours??"—"}h/ano</span></div>)}
    </section>)}

    <section className="table-card" style={{marginTop:16}}>
      <h3>Competências cadastradas</h3>
      {competencies.map(c=><div className="table-row" key={c.id}><strong>{c.code} · {c.title}</strong><span>{c.gradeLevel??"—"} · {c.subjectArea??"—"}</span><span>{c.framework.name}</span></div>)}
    </section>
  </main>;
}

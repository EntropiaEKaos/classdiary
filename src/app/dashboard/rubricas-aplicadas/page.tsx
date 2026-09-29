import { applyRubricAssessmentAction } from "@/app/actions/assessments";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("assessments","view");
  const [rubrics,students,submissions,rows]=await Promise.all([
    db.rubric.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.student.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.assignmentSubmission.findMany({where:{student:{organizationId:org.id}},include:{assignment:true,student:true},orderBy:{submittedAt:"desc"},take:300}),
    db.rubricAssessment.findMany({where:{organizationId:org.id},include:{rubric:true,student:true,author:true,submission:{include:{assignment:true}}},orderBy:{createdAt:"desc"},take:300})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Rubricas aplicadas</h1><div className="muted">Avaliação estruturada de entregas e alunos.</div></div></div>

    <section className="table-card">
      <form action={applyRubricAssessmentAction} className="form-grid">
        <select name="rubricId">{rubrics.map(r=><option key={r.id} value={r.id}>{r.name} · máx. {String(r.maxScore)}</option>)}</select>
        <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="submissionId"><option value="">Sem entrega vinculada</option>{submissions.map(s=><option key={s.id} value={s.id}>{s.student.name} · {s.assignment.title}</option>)}</select>
        <input name="totalScore" type="number" step=".01" min="0" required placeholder="Pontuação"/>
        <input name="feedback" placeholder="Feedback geral"/>
        <textarea name="details" rows={5} placeholder='JSON opcional por critério, ex.: {"argumentação":8,"clareza":9}'/>
        <button className="btn btn-primary">Aplicar rubrica</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      {rows.map(r=><div className="notice" key={r.id}><strong>{r.student.name} · {r.rubric.name}</strong><div className="muted">Nota {String(r.totalScore)} · {r.submission?.assignment.title??"Sem entrega"} · {r.author.name}</div>{r.feedback?<div>{r.feedback}</div>:null}</div>)}
    </section>
  </main>;
}

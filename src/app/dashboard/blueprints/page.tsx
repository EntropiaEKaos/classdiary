import { createExamBlueprintAction, generateExamFromBlueprintAction } from "@/app/actions/assessments";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {user,org}=await requireModulePermission("assessments","view");
  const membership=user.memberships.find(m=>m.organizationId===org.id);
  const teacherOnly=membership?.role==="TEACHER";

  const [subjects,competencies,blueprints,classes,periods]=await Promise.all([
    db.subject.findMany({where:{organizationId:org.id,...(teacherOnly?{classSubjects:{some:{teacherId:user.id}}}:{})},orderBy:{name:"asc"}}),
    db.curriculumCompetency.findMany({where:{organizationId:org.id},orderBy:{code:"asc"}}),
    db.examBlueprint.findMany({where:{organizationId:org.id,active:true},include:{subject:true,components:{include:{competency:true}}},orderBy:{name:"asc"}}),
    db.classGroup.findMany({where:{organizationId:org.id,...(teacherOnly?{classSubjects:{some:{teacherId:user.id}}}:{})},orderBy:{name:"asc"}}),
    db.academicPeriod.findMany({where:{organizationId:org.id,active:true},include:{schoolYear:true},orderBy:[{schoolYear:{name:"desc"}},{order:"asc"}]})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Blueprints de avaliação</h1><div className="muted">Modelos reutilizáveis por competência, dificuldade e tipo de questão.</div></div></div>

    <section className="table-card">
      <h3>Novo blueprint</h3>
      <form action={createExamBlueprintAction} className="form-grid">
        <input name="name" required placeholder="Avaliação Matemática 7º Ano"/>
        <select name="subjectId"><option value="">Interdisciplinar</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input name="description" placeholder="Descrição"/>
        <select name="competencyId">{competencies.map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
        <select name="questionType"><option value="">Qualquer tipo</option><option value="MULTIPLE_CHOICE">Múltipla escolha</option><option value="TRUE_FALSE">V/F</option><option value="SHORT_TEXT">Texto curto</option><option value="ESSAY">Discursiva</option></select>
        <select name="difficulty"><option value="">Qualquer dificuldade</option><option value="EASY">Fácil</option><option value="MEDIUM">Média</option><option value="HARD">Difícil</option></select>
        <input name="questionCount" type="number" min="1" max="50" defaultValue="5"/>
        <input name="pointsEach" type="number" step=".01" min=".01" defaultValue="1"/>
        <button className="btn btn-primary">Criar blueprint</button>
      </form>
    </section>

    {blueprints.map(b=><section className="table-card" style={{marginTop:16}} key={b.id}>
      <h3>{b.name}</h3>
      <p className="muted">{b.subject?.name??"Interdisciplinar"} · {b.components.length} componente(s)</p>
      {b.components.map(c=><div className="table-row" key={c.id}><strong>{c.competency.code}</strong><span>{c.questionCount} questões · {c.questionType??"qualquer tipo"} · {c.difficulty??"qualquer dificuldade"}</span><span>{String(c.pointsEach)} pts cada</span></div>)}
      <form action={generateExamFromBlueprintAction} className="form-grid compact" style={{marginTop:10}}>
        <input type="hidden" name="blueprintId" value={b.id}/>
        <input name="title" required placeholder="Título da prova"/>
        <select name="classGroupId">{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="subjectId">{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="academicPeriodId"><option value="">Sem período</option>{periods.map(p=><option key={p.id} value={p.id}>{p.schoolYear.name} · {p.name}</option>)}</select>
        <button className="btn btn-primary">Gerar prova</button>
      </form>
    </section>)}
  </main>;
}

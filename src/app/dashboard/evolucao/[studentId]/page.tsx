import { notFound } from "next/navigation";
import { createPedagogicalObservationAction } from "@/app/actions/pedagogy";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page({params}:{params:Promise<{studentId:string}>}){
  const {org}=await requireModulePermission("pedagogy","view");
  const {studentId}=await params;
  const student=await db.student.findFirst({
    where:{id:studentId,organizationId:org.id},
    include:{
      grades:{include:{subject:true},orderBy:{createdAt:"asc"}},
      attendance:{include:{lesson:{include:{subject:true}}}},
      competencyAssessments:{include:{competency:true,subject:true,author:true},orderBy:{assessedAt:"asc"}},
      pedagogicalInterventions:{include:{createdBy:true},orderBy:{startsAt:"asc"}},
      pedagogicalObservations:{include:{author:true},orderBy:{createdAt:"asc"}}
    }
  });
  if(!student) notFound();

  const total=student.attendance.length;
  const present=student.attendance.filter(a=>["PRESENT","LATE","EXCUSED"].includes(a.status)).length;
  const attendance=total?(present/total)*100:100;
  const gradeValues=student.grades.map(g=>(Number(g.value)/Number(g.maxValue))*10);
  const avg=gradeValues.length?gradeValues.reduce((a,b)=>a+b,0)/gradeValues.length:0;

  return <main className="main">
    <div className="page-head"><div><h1>{student.name}</h1><div className="muted">Evolução longitudinal · matrícula {student.registration}</div></div></div>
    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Média acumulada</span><div className="value">{avg.toFixed(2)}</div></div>
      <div className="kpi"><span className="muted">Frequência</span><div className="value">{attendance.toFixed(1)}%</div></div>
      <div className="kpi"><span className="muted">Competências avaliadas</span><div className="value">{student.competencyAssessments.length}</div></div>
      <div className="kpi"><span className="muted">Intervenções</span><div className="value">{student.pedagogicalInterventions.length}</div></div>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Nova observação pedagógica</h3>
      <form action={createPedagogicalObservationAction} className="form-grid compact">
        <input type="hidden" name="studentId" value={student.id}/>
        <input name="category" required placeholder="Comportamento / aprendizagem / socioemocional"/>
        <input name="note" required placeholder="Observação"/>
        <select name="visibility"><option value="STAFF">Somente equipe</option><option value="FAMILY">Pode ser compartilhada com família</option></select>
        <button className="btn btn-primary">Registrar</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Linha do tempo pedagógica</h3>
      {student.competencyAssessments.map(a=><div className="notice" key={"c"+a.id}><strong>{a.assessedAt.toLocaleDateString("pt-BR")} · Competência {a.competency.code}</strong><div>{a.level} · {a.subject?.name??"Interdisciplinar"}</div>{a.evidence?<div className="muted">{a.evidence}</div>:null}</div>)}
      {student.pedagogicalInterventions.map(i=><div className="notice" key={"i"+i.id}><strong>{i.startsAt.toLocaleDateString("pt-BR")} · Intervenção</strong><div>{i.reason}</div><div className="muted">{i.status} · {i.outcome??i.plan}</div></div>)}
      {student.pedagogicalObservations.map(o=><div className="notice" key={"o"+o.id}><strong>{o.createdAt.toLocaleDateString("pt-BR")} · {o.category}</strong><div>{o.note}</div><div className="muted">{o.author.name} · {o.visibility}</div></div>)}
    </section>
  </main>;
}

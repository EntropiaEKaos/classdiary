import {closePeriodAction} from "@/app/actions/academic";
import {activeOrganization} from "@/lib/auth";
import {db} from "@/lib/db";
import {redirect} from "next/navigation";

export const dynamic="force-dynamic";

function avg(rows:{value:unknown;maxValue:unknown;weight:unknown}[]){
  const total=rows.reduce((s,g)=>s+Number(g.weight),0);
  if(!total)return 0;
  return rows.reduce((s,g)=>s+((Number(g.value)/Number(g.maxValue))*10)*Number(g.weight),0)/total;
}

export default async function Page(){
  const org=await activeOrganization();if(!org)redirect("/onboarding");
  const [students,closures]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true},include:{grades:{include:{subject:true}}},orderBy:{name:"asc"}}),
    db.periodClosure.findMany({where:{organizationId:org.id},orderBy:{closedAt:"desc"}})
  ]);

  const periods=[...new Set(students.flatMap(s=>s.grades.map(g=>g.period)))];

  return <main className="main">
    <div className="page-head"><div><h1>Boletins</h1><div className="muted">Médias ponderadas e fechamento acadêmico</div></div><a className="btn btn-light" href="/api/boletins/lote" target="_blank">Gerar todos em PDF</a></div>

    <section className="table-card">
      <h3>Fechar período</h3>
      <form action={closePeriodAction} className="form-grid compact">
        <input name="period" required placeholder="Ex.: 1º Bimestre"/>
        <button className="btn btn-primary">Fechar período</button>
      </form>
      <p className="muted">Períodos fechados: {closures.length?closures.map(c=>c.period).join(", "):"nenhum"}</p>
    </section>

    {students.map(student=><section className="table-card" style={{marginTop:16}} key={student.id}>
      <div className="page-head" style={{marginBottom:8}}><h3>{student.name}</h3><a className="btn btn-light" href={`/api/boletins/${student.id}`} target="_blank">Abrir PDF</a></div>
      {periods.map(period=>{
        const periodGrades=student.grades.filter(g=>g.period===period);
        const subjects=[...new Map(periodGrades.map(g=>[g.subjectId,g.subject])).values()];
        if(!subjects.length)return null;
        return <div key={period} style={{marginTop:12}}>
          <strong>{period}</strong>
          {subjects.map(subject=>{
            const rows=periodGrades.filter(g=>g.subjectId===subject.id);
            return <div className="table-row" key={subject.id}><span>{subject.name}</span><span>{rows.length} avaliações</span><strong>{avg(rows).toFixed(2)}</strong></div>
          })}
        </div>
      })}
    </section>)}
  </main>
}
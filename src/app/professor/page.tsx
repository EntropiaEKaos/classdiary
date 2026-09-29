import Link from "next/link";
import {redirect} from "next/navigation";
import {requireUser,activeOrganization} from "@/lib/auth";
import {db} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function TeacherPortal(){
  const user=await requireUser();
  const org=await activeOrganization();
  if(!org)redirect("/onboarding");

  const isTeacher=user.memberships.some(m=>m.organizationId===org.id&&m.role==="TEACHER");
  if(!isTeacher)redirect("/dashboard");

  const [assignments,lessons]=await Promise.all([
    db.classSubject.findMany({
      where:{teacherId:user.id,classGroup:{organizationId:org.id}},
      include:{classGroup:true,subject:true},
      orderBy:{classGroup:{name:"asc"}}
    }),
    db.lesson.findMany({
      where:{teacherId:user.id,classGroup:{organizationId:org.id}},
      include:{classGroup:true,subject:true,_count:{select:{attendance:true}}},
      orderBy:{lessonDate:"desc"},
      take:20
    })
  ]);

  return <main className="main">
    <div className="page-head">
      <div>
        <span className="badge">Portal do Professor</span>
        <h1>Olá, {user.name}</h1>
        <div className="muted">Suas turmas, disciplinas e registros recentes.</div>
      </div>
      <Link href="/dashboard/diarios" className="btn btn-primary">Registrar aula</Link>
    </div>

    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Turmas / disciplinas</span><div className="value">{assignments.length}</div></div>
      <div className="kpi"><span className="muted">Aulas registradas</span><div className="value">{lessons.length}</div></div>
      <div className="kpi"><span className="muted">Chamadas lançadas</span><div className="value">{lessons.reduce((s,l)=>s+l._count.attendance,0)}</div></div>
      <div className="kpi"><span className="muted">Escola</span><div style={{fontWeight:800,marginTop:12}}>{org.name}</div></div>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Minhas turmas</h3>
      {assignments.length===0?<p className="muted">Nenhuma disciplina vinculada ainda.</p>:assignments.map(a=>
        <div className="table-row" key={a.id}>
          <strong>{a.classGroup.name}</strong>
          <span>{a.subject.name}</span>
          <Link href="/dashboard/diarios">Abrir diário</Link>
        </div>
      )}
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Aulas recentes</h3>
      {lessons.length===0?<p className="muted">Nenhuma aula registrada ainda.</p>:lessons.map(l=>
        <div className="table-row" key={l.id}>
          <strong>{l.title}</strong>
          <span>{l.classGroup.name} · {l.subject.name}</span>
          <span>{l._count.attendance} chamadas</span>
        </div>
      )}
    </section>
  </main>
}
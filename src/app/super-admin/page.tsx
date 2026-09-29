import Link from "next/link";
import {db} from "@/lib/db";
import {requirePlatformOwner} from "@/lib/auth";

export const dynamic="force-dynamic";

export default async function SuperAdminPage(){
  await requirePlatformOwner();

  const [organizations,totalUsers,totalStudents,activeTrials]=await Promise.all([
    db.organization.findMany({
      where:{slug:{not:"classdiary-platform"}},
      include:{
        subscription:true,
        _count:{select:{memberships:true,students:true,classGroups:true}}
      },
      orderBy:{createdAt:"desc"}
    }),
    db.user.count(),
    db.student.count(),
    db.subscription.count({where:{status:"TRIAL"}})
  ]);

  return <main className="main">
    <div className="page-head">
      <div>
        <span className="badge">ClassDiary SaaS</span>
        <h1>Super Admin</h1>
        <div className="muted">Visão geral comercial e operacional de todas as escolas.</div>
      </div>
      <Link className="btn btn-light" href="/dashboard">Ir para ambiente escolar</Link>
    </div>

    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Escolas</span><div className="value">{organizations.length}</div></div>
      <div className="kpi"><span className="muted">Usuários</span><div className="value">{totalUsers}</div></div>
      <div className="kpi"><span className="muted">Alunos</span><div className="value">{totalStudents}</div></div>
      <div className="kpi"><span className="muted">Trials ativos</span><div className="value">{activeTrials}</div></div>
    </div>

    <section style={{marginTop:20}}>
      <div className="admin-grid">
        {organizations.map(org=><article className="tenant-card" key={org.id}>
          <span className="pill">{org.subscription?.status??"SEM PLANO"}</span>
          <h3 style={{marginTop:12}}>{org.name}</h3>
          <div className="muted">{org.slug}</div>
          <div className="tenant-meta">
            <span>Plano: <strong>{org.subscription?.plan??"—"}</strong></span>
            <span>Alunos: <strong>{org._count.students}</strong></span>
            <span>Turmas: <strong>{org._count.classGroups}</strong></span>
            <span>Usuários: <strong>{org._count.memberships}</strong></span>
            <span>Status: <strong>{org.active?"Ativa":"Bloqueada"}</strong></span>
          </div>
        </article>)}
      </div>
      {organizations.length===0?<div className="table-card"><p className="muted">Nenhuma escola cliente criada ainda.</p></div>:null}
    </section>
  </main>
}
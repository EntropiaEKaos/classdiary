import { createTeacherAction } from "@/app/actions/school";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const teachers = await db.membership.findMany({
    where: { organizationId: org.id, role: "TEACHER" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  return <main className="main">
    <div className="page-head"><div><h1>Professores</h1><div className="muted">Equipe docente</div></div></div>

    <section className="table-card">
      <form action={createTeacherAction} className="form-grid compact">
        <input name="name" required placeholder="Nome completo"/>
        <input name="email" type="email" required placeholder="professor@escola.com"/>
        <button className="btn btn-primary" type="submit">Adicionar professor</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      {teachers.length===0 ? <p className="muted">Nenhum professor cadastrado.</p> : teachers.map((membership)=>
        <div className="table-row" key={membership.id}>
          <strong>{membership.user.name}</strong>
          <span>{membership.user.email}</span>
          <span>{membership.user.active?"Ativo":"Inativo"}</span>
        </div>
      )}
    </section>
  </main>;
}

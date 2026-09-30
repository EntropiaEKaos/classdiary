import { createClassAction } from "@/app/actions/school";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("academic", "view");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const canCreate = roles.some((role) => ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role));
  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) => ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role));

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  const classes = await db.classGroup.findMany({
    where: {
      organizationId: org.id,
      ...(year ? { schoolYearId: year.id } : {}),
      ...(teacherOnly ? { classSubjects: { some: { teacherId: user.id } } } : {}),
    },
    include: {
      _count: {
        select: {
          enrollments: { where: { active: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return <main className="main">
    <div className="page-head"><div><h1>Turmas</h1><div className="muted">{year ? "Ano letivo "+year.name : "Sem ano letivo ativo"}</div></div></div>

    {canCreate && year ? <section className="table-card">
      <form action={createClassAction} className="form-grid compact">
        <input name="name" required placeholder="7º Ano A"/>
        <input name="gradeLevel" placeholder="Série"/>
        <input name="shift" placeholder="Turno"/>
        <input name="room" placeholder="Sala"/>
        <button className="btn btn-primary" type="submit">Criar turma</button>
      </form>
    </section> : null}

    <section className="table-card" style={{marginTop:16}}>
      {classes.length===0 ? <p className="muted">Nenhuma turma disponível.</p> : classes.map((item)=>
        <div className="table-row" key={item.id}>
          <strong>{item.name}</strong>
          <span>{item.shift||"—"}</span>
          <span>{item._count.enrollments} alunos</span>
        </div>
      )}
    </section>
  </main>;
}

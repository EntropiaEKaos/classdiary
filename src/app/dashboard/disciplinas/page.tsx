import { assignSubjectAction, createSubjectAction } from "@/app/actions/academic";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("academic", "view");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const canManage = roles.some((role) => ["SCHOOL_ADMIN", "COORDINATOR"].includes(role));
  const teacherOnly = roles.includes("TEACHER") && !canManage;

  const [subjects, classes, teachers, links] = await Promise.all([
    db.subject.findMany({
      where: {
        organizationId: org.id,
        ...(teacherOnly ? { classSubjects: { some: { teacherId: user.id } } } : {}),
      },
      orderBy: { name: "asc" },
    }),
    db.classGroup.findMany({
      where: {
        organizationId: org.id,
        ...(teacherOnly ? { classSubjects: { some: { teacherId: user.id } } } : {}),
      },
      orderBy: { name: "asc" },
    }),
    canManage
      ? db.membership.findMany({
          where: { organizationId: org.id, role: "TEACHER" },
          include: { user: true },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    db.classSubject.findMany({
      where: {
        classGroup: { organizationId: org.id },
        ...(teacherOnly ? { teacherId: user.id } : {}),
      },
      include: { classGroup: true, subject: true, teacher: true },
    }),
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Disciplinas</h1><div className="muted">Currículo e alocação docente</div></div></div>

    {canManage ? <section className="table-card">
      <h3>Nova disciplina</h3>
      <form action={createSubjectAction} className="form-grid compact">
        <input name="name" required placeholder="Matemática"/>
        <input name="code" placeholder="MAT"/>
        <button className="btn btn-primary">Criar</button>
      </form>

      <h3 style={{marginTop:24}}>Vincular à turma</h3>
      <form action={assignSubjectAction} className="form-grid compact">
        <select name="classGroupId">{classes.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="subjectId">{subjects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="teacherId"><option value="">Sem professor</option>{teachers.map((item)=><option key={item.user.id} value={item.user.id}>{item.user.name}</option>)}</select>
        <button className="btn btn-primary">Vincular</button>
      </form>
    </section> : null}

    <section className="table-card" style={{marginTop:16}}>
      {links.map((link)=><div className="table-row" key={link.id}>
        <strong>{link.classGroup.name}</strong>
        <span>{link.subject.name}</span>
        <span>{link.teacher?.name ?? "Sem professor"}</span>
      </div>)}
    </section>
  </main>;
}

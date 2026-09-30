import { enrollStudentAction } from "@/app/actions/academic";
import { db } from "@/lib/db";
import { hasModulePermission, requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireModulePermission("students", "view");
  const canCreate = await hasModulePermission("students", "create");

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  const [students, classes, enrollments] = await Promise.all([
    db.student.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: { name: "asc" },
    }),
    db.classGroup.findMany({
      where: {
        organizationId: org.id,
        ...(year ? { schoolYearId: year.id } : {}),
      },
      orderBy: { name: "asc" },
    }),
    db.enrollment.findMany({
      where: {
        active: true,
        classGroup: {
          organizationId: org.id,
          ...(year ? { schoolYearId: year.id } : {}),
        },
      },
      include: { student: true, classGroup: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Matrículas</h1><div className="muted">{year ? "Ano letivo "+year.name : "Sem ano letivo ativo"}</div></div></div>

    {canCreate && year ? <section className="table-card">
      <form action={enrollStudentAction} className="form-grid compact">
        <select name="studentId" required>{students.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select name="classGroupId" required>{classes.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <button className="btn btn-primary">Matricular</button>
      </form>
    </section> : null}

    <section className="table-card" style={{marginTop:16}}>
      {enrollments.map((item)=><div className="table-row" key={item.id}>
        <strong>{item.student.name}</strong>
        <span>{item.classGroup.name}</span>
        <span>Ativa</span>
      </div>)}
    </section>
  </main>;
}

import { createGradeAction } from "@/app/actions/academic";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("academic", "view");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) => ["SCHOOL_ADMIN", "COORDINATOR"].includes(role));

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  const classSubjects = teacherOnly
    ? await db.classSubject.findMany({
        where: {
          teacherId: user.id,
          classGroup: {
            organizationId: org.id,
            ...(year ? { schoolYearId: year.id } : {}),
          },
        },
        include: { classGroup: true, subject: true },
      })
    : [];

  const teacherClassIds = [...new Set(classSubjects.map((item) => item.classGroupId))];
  const teacherSubjectIds = [...new Set(classSubjects.map((item) => item.subjectId))];

  const [students, subjects, periods, grades] = await Promise.all([
    db.student.findMany({
      where: {
        organizationId: org.id,
        active: true,
        ...(teacherOnly
          ? { enrollments: { some: { active: true, classGroupId: { in: teacherClassIds } } } }
          : year
            ? { enrollments: { some: { active: true, classGroup: { schoolYearId: year.id } } } }
            : {}),
      },
      orderBy: { name: "asc" },
    }),
    db.subject.findMany({
      where: {
        organizationId: org.id,
        ...(teacherOnly ? { id: { in: teacherSubjectIds } } : {}),
      },
      orderBy: { name: "asc" },
    }),
    year
      ? db.academicPeriod.findMany({
          where: { organizationId: org.id, schoolYearId: year.id, active: true },
          orderBy: { order: "asc" },
        })
      : Promise.resolve([]),
    db.grade.findMany({
      where: {
        student: { organizationId: org.id },
        ...(year
          ? {
              OR: [
                { schoolYearId: year.id },
                { schoolYearId: null, createdAt: { gte: year.startsAt, lte: year.endsAt } },
              ],
            }
          : {}),
        ...(teacherOnly
          ? {
              subjectId: { in: teacherSubjectIds },
              student: {
                organizationId: org.id,
                enrollments: { some: { active: true, classGroupId: { in: teacherClassIds } } },
              },
            }
          : {}),
      },
      include: { student: true, subject: true, academicPeriod: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Notas</h1><div className="muted">{year ? "Ano letivo "+year.name : "Sem ano letivo ativo"}</div></div></div>

    {year ? <section className="table-card">
      <form action={createGradeAction} className="form-grid compact">
        <select name="studentId">{students.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select name="subjectId">{subjects.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select name="period" required>{periods.map((item)=><option value={item.name} key={item.id}>{item.name}</option>)}</select>
        <input name="label" required placeholder="Prova 1"/>
        <input name="value" type="number" step=".01" required placeholder="Nota"/>
        <input name="maxValue" type="number" step=".01" defaultValue="10"/>
        <input name="weight" type="number" step=".01" defaultValue="1" min="0.01" placeholder="Peso"/>
        <button className="btn btn-primary">Lançar nota</button>
      </form>
    </section> : null}

    <section className="table-card" style={{marginTop:16}}>
      {grades.map((grade)=><div className="table-row" key={grade.id}>
        <strong>{grade.student.name}</strong>
        <span>{grade.subject.name} · {grade.label} · {grade.academicPeriod?.name ?? grade.period}</span>
        <span>{String(grade.value)}/{String(grade.maxValue)}</span>
      </div>)}
    </section>
  </main>;
}

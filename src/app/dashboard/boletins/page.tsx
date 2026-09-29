import { closePeriodAction } from "@/app/actions/academic";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function avg(rows: { value: unknown; maxValue: unknown; weight: unknown }[]) {
  const total = rows.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (!total) return 0;

  return (
    rows.reduce(
      (sum, grade) =>
        sum +
        ((Number(grade.value) / Number(grade.maxValue)) * 10) *
          Number(grade.weight),
      0,
    ) / total
  );
}

export default async function Page() {
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
    "SECRETARY",
  ]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Boletins</h1>
          <p className="muted">Nenhum ano letivo ativo configurado.</p>
        </section>
      </main>
    );
  }

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) =>
      ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role),
    );

  const canClose = roles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
  );

  const [students, closures] = await Promise.all([
    db.student.findMany({
      where: {
        organizationId: org.id,
        active: true,
        enrollments: {
          some: {
            active: true,
            classGroup: {
              schoolYearId: year.id,
              ...(teacherOnly
                ? {
                    classSubjects: {
                      some: { teacherId: user.id },
                    },
                  }
                : {}),
            },
          },
        },
      },
      include: {
        grades: {
          where: {
            OR: [
              { schoolYearId: year.id },
              {
                schoolYearId: null,
                createdAt: { gte: year.startsAt, lte: year.endsAt },
              },
            ],
          },
          include: { subject: true, academicPeriod: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.periodClosure.findMany({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
      },
      orderBy: { closedAt: "desc" },
    }),
  ]);

  const periods = [
    ...new Set(
      students.flatMap((student) =>
        student.grades.map(
          (grade) => grade.academicPeriod?.name ?? grade.period,
        ),
      ),
    ),
  ];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Boletins</h1>
          <div className="muted">
            Ano letivo {year.name} · médias ponderadas
          </div>
        </div>

        {!teacherOnly ? (
          <a
            className="btn btn-light"
            href="/api/boletins/lote"
            target="_blank"
          >
            Gerar todos em PDF
          </a>
        ) : null}
      </div>

      {canClose ? (
        <section className="table-card">
          <h3>Fechar período</h3>
          <form action={closePeriodAction} className="form-grid compact">
            <select name="period" required defaultValue="">
              <option value="" disabled>
                Selecione o período
              </option>
              {await db.academicPeriod
                .findMany({
                  where: {
                    organizationId: org.id,
                    schoolYearId: year.id,
                    active: true,
                  },
                  orderBy: { order: "asc" },
                })
                .then((rows) =>
                  rows.map((period) => (
                    <option key={period.id} value={period.name}>
                      {period.name}
                    </option>
                  )),
                )}
            </select>
            <button className="btn btn-primary">Fechar período</button>
          </form>

          <p className="muted">
            Períodos fechados:{" "}
            {closures.length
              ? closures.map((closure) => closure.period).join(", ")
              : "nenhum"}
          </p>
        </section>
      ) : null}

      {students.map((student) => (
        <section
          className="table-card"
          style={{ marginTop: 16 }}
          key={student.id}
        >
          <div className="page-head" style={{ marginBottom: 8 }}>
            <h3>{student.name}</h3>
            <a
              className="btn btn-light"
              href={`/api/boletins/${student.id}`}
              target="_blank"
            >
              Abrir PDF
            </a>
          </div>

          {periods.map((period) => {
            const periodGrades = student.grades.filter(
              (grade) =>
                (grade.academicPeriod?.name ?? grade.period) === period,
            );

            const subjects = [
              ...new Map(
                periodGrades.map((grade) => [grade.subjectId, grade.subject]),
              ).values(),
            ];

            if (!subjects.length) return null;

            return (
              <div key={period} style={{ marginTop: 12 }}>
                <strong>{period}</strong>

                {subjects.map((subject) => {
                  const rows = periodGrades.filter(
                    (grade) => grade.subjectId === subject.id,
                  );

                  return (
                    <div className="table-row" key={subject.id}>
                      <span>{subject.name}</span>
                      <span>{rows.length} avaliações</span>
                      <strong>{avg(rows).toFixed(2)}</strong>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}

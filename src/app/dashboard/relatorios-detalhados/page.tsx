import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function avg(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Relatórios por turma e professor</h1>
          <p className="muted">Nenhum ano letivo ativo.</p>
        </section>
      </main>
    );
  }

  const [classes, teachers] = await Promise.all([
    db.classGroup.findMany({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
      },
      include: {
        enrollments: {
          where: { active: true },
          include: {
            student: {
              include: {
                grades: {
                  where: {
                    OR: [
                      { schoolYearId: year.id },
                      {
                        schoolYearId: null,
                        createdAt: {
                          gte: year.startsAt,
                          lte: year.endsAt,
                        },
                      },
                    ],
                  },
                },
                attendance: {
                  where: {
                    lesson: {
                      classGroup: {
                        organizationId: org.id,
                        schoolYearId: year.id,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        lessons: true,
      },
      orderBy: { name: "asc" },
    }),

    db.membership.findMany({
      where: {
        organizationId: org.id,
        role: "TEACHER",
      },
      include: {
        user: {
          include: {
            lessons: {
              where: {
                classGroup: {
                  organizationId: org.id,
                  schoolYearId: year.id,
                },
              },
            },
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const classRows = classes.map((classGroup) => {
    const students = classGroup.enrollments.map(
      (enrollment) => enrollment.student,
    );

    const gradeValues = students.flatMap((student) =>
      student.grades.map(
        (grade) =>
          (Number(grade.value) / Number(grade.maxValue)) * 10,
      ),
    );

    const attendanceValues = students.map((student) => {
      const total = student.attendance.length;
      const present = student.attendance.filter((entry) =>
        ["PRESENT", "LATE", "EXCUSED"].includes(entry.status),
      ).length;

      return total ? (present / total) * 100 : 100;
    });

    return {
      id: classGroup.id,
      name: classGroup.name,
      students: students.length,
      lessons: classGroup.lessons.length,
      grade: avg(gradeValues),
      attendance: avg(attendanceValues),
    };
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Relatórios por turma e professor</h1>
          <div className="muted">
            Ano letivo {year.name} · visão comparativa isolada por período anual.
          </div>
        </div>
      </div>

      <section className="table-card">
        <h3>Turmas</h3>
        {classRows.map((row) => (
          <div className="table-row" key={row.id}>
            <strong>
              {row.name} · {row.students} alunos
            </strong>
            <span>
              Média {row.grade.toFixed(2)} · Freq.{" "}
              {row.attendance.toFixed(1)}%
            </span>
            <span>{row.lessons} aulas</span>
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Professores</h3>
        {teachers.map((teacher) => (
          <div className="table-row" key={teacher.id}>
            <strong>{teacher.user.name}</strong>
            <span>{teacher.user.email}</span>
            <span>{teacher.user.lessons.length} aulas registradas</span>
          </div>
        ))}
      </section>
    </main>
  );
}

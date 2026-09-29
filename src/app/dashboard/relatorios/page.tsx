import Link from "next/link";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function normalizedAverage(
  grades: { value: unknown; maxValue: unknown; weight: unknown }[],
) {
  const weight = grades.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (!weight) return 0;

  return (
    grades.reduce(
      (sum, grade) =>
        sum +
        ((Number(grade.value) / Number(grade.maxValue)) * 10) *
          Number(grade.weight),
      0,
    ) / weight
  );
}

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Relatórios e risco acadêmico</h1>
          <p className="muted">Nenhum ano letivo ativo configurado.</p>
        </section>
      </main>
    );
  }

  const students = await db.student.findMany({
    where: {
      organizationId: org.id,
      active: true,
      enrollments: {
        some: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
      },
    },
    include: {
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
      },
      enrollments: {
        where: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
        include: { classGroup: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = students.map((student) => {
    const total = student.attendance.length;
    const present = student.attendance.filter((item) =>
      ["PRESENT", "LATE", "EXCUSED"].includes(item.status),
    ).length;

    const attendance = total ? (present / total) * 100 : 100;
    const grade = normalizedAverage(student.grades);

    const risk =
      attendance < org.attendanceWarningPercent ||
      (student.grades.length > 0 && grade < Number(org.passingGrade));

    return {
      id: student.id,
      name: student.name,
      className: student.enrollments[0]?.classGroup.name ?? "—",
      attendance,
      grade,
      risk,
    };
  });

  const risks = rows.filter((row) => row.risk);

  const avgAttendance = rows.length
    ? rows.reduce((sum, row) => sum + row.attendance, 0) / rows.length
    : 100;

  const graded = rows.filter((row) => row.grade > 0);

  const avgGrade = graded.length
    ? graded.reduce((sum, row) => sum + row.grade, 0) / graded.length
    : 0;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Relatórios e risco acadêmico</h1>
          <div className="muted">
            Ano letivo {year.name} · indicadores isolados do histórico anterior.
          </div>
        </div>

        <div className="top-actions">
          <Link
            className="btn btn-light"
            href="/dashboard/relatorios-detalhados"
          >
            Turmas e professores
          </Link>
          <Link className="btn btn-light" href="/api/export/alunos">
            Exportar alunos CSV
          </Link>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Alunos monitorados</span>
          <div className="value">{rows.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Em alerta</span>
          <div className="value">{risks.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Frequência média</span>
          <div className="value">{avgAttendance.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <span className="muted">Média geral</span>
          <div className="value">{avgGrade.toFixed(2)}</div>
        </div>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Alunos que exigem atenção</h3>

        {risks.length === 0 ? (
          <p className="muted">
            Nenhum aluno ultrapassou os limites de alerta configurados.
          </p>
        ) : (
          risks.map((row) => (
            <div className="table-row" key={row.id}>
              <strong>
                {row.name} · {row.className}
              </strong>
              <span>Frequência {row.attendance.toFixed(1)}%</span>
              <span>Média {row.grade.toFixed(2)}</span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

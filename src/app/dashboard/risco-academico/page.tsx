import {
  createRiskInterventionAction,
  notifyGuardianAcademicRiskAction,
} from "@/app/actions/academic-operations";
import { db } from "@/lib/db";
import {
  hasModulePermission,
  requireModulePermission,
} from "@/lib/rbac";

export const dynamic = "force-dynamic";

function averageGrade(
  rows: { value: unknown; maxValue: unknown; weight: unknown }[],
) {
  const total = rows.reduce((sum, row) => sum + Number(row.weight), 0);
  if (!total) return 0;

  return (
    rows.reduce(
      (sum, row) =>
        sum +
        ((Number(row.value) / Number(row.maxValue)) * 10) *
          Number(row.weight),
      0,
    ) / total
  );
}

function attendancePercent(rows: { status: string }[]) {
  if (!rows.length) return 100;
  const attended = rows.filter((row) =>
    ["PRESENT", "LATE", "EXCUSED"].includes(row.status),
  ).length;
  return (attended / rows.length) * 100;
}

export default async function Page() {
  const { user, org } = await requireModulePermission("pedagogy", "view");
  const canCreate = await hasModulePermission("pedagogy", "create");
  const canUpdate = await hasModulePermission("pedagogy", "update");

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Risco acadêmico</h1>
          <p className="muted">Nenhum ano letivo ativo.</p>
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
      ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
    );

  const classIds = teacherOnly
    ? (
        await db.classSubject.findMany({
          where: {
            teacherId: user.id,
            classGroup: {
              organizationId: org.id,
              schoolYearId: year.id,
            },
          },
          select: { classGroupId: true },
        })
      ).map((item) => item.classGroupId)
    : [];

  const students = await db.student.findMany({
    where: {
      organizationId: org.id,
      active: true,
      enrollments: {
        some: {
          active: true,
          classGroup: {
            schoolYearId: year.id,
            ...(teacherOnly
              ? { id: { in: classIds } }
              : {}),
          },
        },
      },
    },
    include: {
      enrollments: {
        where: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
        include: { classGroup: true },
      },
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
          ...(teacherOnly
            ? { classGroupId: { in: classIds } }
            : {}),
        },
      },
      attendance: {
        where: {
          lesson: {
            classGroup: {
              organizationId: org.id,
              schoolYearId: year.id,
              ...(teacherOnly
                ? { id: { in: classIds } }
                : {}),
            },
          },
        },
      },
      guardians: true,
      pedagogicalInterventions: {
        where: { status: "ACTIVE" },
        orderBy: { startsAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = students
    .map((student) => {
      const average = averageGrade(student.grades);
      const attendance = attendancePercent(student.attendance);
      const gradeRisk =
        student.grades.length > 0 &&
        average < Number(org.passingGrade);
      const attendanceRisk =
        attendance < org.attendanceWarningPercent;

      const critical =
        (gradeRisk &&
          average < Math.max(0, Number(org.passingGrade) - 2)) ||
        attendance < Math.max(0, org.attendanceWarningPercent - 10);

      return {
        student,
        average,
        attendance,
        gradeRisk,
        attendanceRisk,
        critical,
      };
    })
    .filter((row) => row.gradeRisk || row.attendanceRisk);

  const criticalCount = rows.filter((row) => row.critical).length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Risco acadêmico</h1>
          <div className="muted">
            {year.name} · alunos abaixo da média ou do limite de frequência.
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Alunos em risco</span>
          <div className="value">{rows.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Risco crítico</span>
          <div className="value">{criticalCount}</div>
        </div>
        <div className="kpi">
          <span className="muted">Média mínima</span>
          <div className="value">
            {Number(org.passingGrade).toFixed(1)}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Frequência mínima</span>
          <div className="value">
            {org.attendanceWarningPercent}%
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <section className="table-card" style={{ marginTop: 16 }}>
          <p className="muted">
            Nenhum aluno está abaixo dos limites configurados.
          </p>
        </section>
      ) : null}

      {rows.map((row) => {
        const reason = [
          row.gradeRisk
            ? `Média ${row.average.toFixed(2)} abaixo de ${Number(org.passingGrade).toFixed(2)}.`
            : "",
          row.attendanceRisk
            ? `Frequência ${row.attendance.toFixed(1)}% abaixo de ${org.attendanceWarningPercent}%.`
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <section
            className="table-card"
            style={{ marginTop: 16 }}
            key={row.student.id}
          >
            <div className="page-head" style={{ marginBottom: 8 }}>
              <div>
                <h3>{row.student.name}</h3>
                <div className="muted">
                  {row.student.enrollments[0]?.classGroup.name ?? "Sem turma"}
                </div>
              </div>
              <span className="status">
                {row.critical ? "CRÍTICO" : "ATENÇÃO"}
              </span>
            </div>

            <div className="table-row">
              <strong>Média</strong>
              <span>{row.average.toFixed(2)}</span>
            </div>
            <div className="table-row">
              <strong>Frequência</strong>
              <span>{row.attendance.toFixed(1)}%</span>
            </div>
            <div className="table-row">
              <strong>Intervenções ativas</strong>
              <span>{row.student.pedagogicalInterventions.length}</span>
            </div>

            {canCreate ? (
              <form
                action={createRiskInterventionAction}
                className="form-grid"
                style={{ marginTop: 10 }}
              >
                <input
                  type="hidden"
                  name="studentId"
                  value={row.student.id}
                />
                <input
                  name="reason"
                  defaultValue={reason}
                  required
                />
                <input
                  name="plan"
                  defaultValue="Acompanhar semanalmente desempenho, frequência e devolutivas com família/professores."
                  required
                />
                <button className="btn btn-primary">
                  Abrir intervenção
                </button>
              </form>
            ) : null}

            {canUpdate && row.student.guardians.length ? (
              <form
                action={notifyGuardianAcademicRiskAction}
                className="form-grid compact"
                style={{ marginTop: 10 }}
              >
                <input
                  type="hidden"
                  name="studentId"
                  value={row.student.id}
                />
                <input
                  name="message"
                  defaultValue={
                    "Identificamos necessidade de acompanhamento acadêmico. " +
                    reason +
                    " Entre em contato com a escola para alinharmos o plano de apoio."
                  }
                  required
                />
                <button className="btn btn-light">
                  Notificar responsável
                </button>
              </form>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}

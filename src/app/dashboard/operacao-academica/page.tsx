import {
  notifyTeacherAcademicPendingAction,
} from "@/app/actions/academic-operations";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function pct(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default async function Page() {
  const { user, org } = await requireModulePermission("academic", "view");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) =>
      ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
    );

  const canNotify = roles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
  );

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Operação acadêmica</h1>
          <p className="muted">Nenhum ano letivo ativo.</p>
        </section>
      </main>
    );
  }

  const now = new Date();
  const periods = await db.academicPeriod.findMany({
    where: {
      organizationId: org.id,
      schoolYearId: year.id,
      active: true,
    },
    orderBy: { order: "asc" },
  });

  const period =
    periods.find(
      (item) => item.startsAt <= now && item.endsAt >= now,
    ) ??
    periods.at(-1);

  if (!period) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Operação acadêmica</h1>
          <p className="muted">
            O ano letivo ativo ainda não possui períodos acadêmicos.
          </p>
        </section>
      </main>
    );
  }

  const links = await db.classSubject.findMany({
    where: {
      classGroup: {
        organizationId: org.id,
        schoolYearId: year.id,
      },
      ...(teacherOnly ? { teacherId: user.id } : {}),
    },
    include: {
      teacher: true,
      subject: true,
      classGroup: {
        include: {
          enrollments: {
            where: { active: true },
            select: { studentId: true },
          },
        },
      },
    },
    orderBy: [
      { classGroup: { name: "asc" } },
      { subject: { name: "asc" } },
    ],
  });

  const rows = await Promise.all(
    links.map(async (link) => {
      const studentIds = link.classGroup.enrollments.map(
        (enrollment) => enrollment.studentId,
      );

      const [lessons, grades, assignments, pendingReviews, pendingJustifications] =
        await Promise.all([
          db.lesson.findMany({
            where: {
              classGroupId: link.classGroupId,
              subjectId: link.subjectId,
              lessonDate: {
                gte: period.startsAt,
                lte: period.endsAt,
              },
            },
            include: {
              attendance: {
                where: { studentId: { in: studentIds } },
                select: { id: true },
              },
            },
          }),
          db.grade.findMany({
            where: {
              classGroupId: link.classGroupId,
              subjectId: link.subjectId,
              academicPeriodId: period.id,
              studentId: { in: studentIds },
            },
            select: { studentId: true },
          }),
          db.assignment.count({
            where: {
              organizationId: org.id,
              classGroupId: link.classGroupId,
              subjectId: link.subjectId,
              academicPeriodId: period.id,
            },
          }),
          db.gradeReviewRequest.count({
            where: {
              organizationId: org.id,
              status: "PENDING",
              grade: {
                classGroupId: link.classGroupId,
                subjectId: link.subjectId,
                academicPeriodId: period.id,
              },
            },
          }),
          db.absenceJustification.count({
            where: {
              organizationId: org.id,
              status: "PENDING",
              attendance: {
                lesson: {
                  classGroupId: link.classGroupId,
                  subjectId: link.subjectId,
                  lessonDate: {
                    gte: period.startsAt,
                    lte: period.endsAt,
                  },
                },
              },
            },
          }),
        ]);

      const expectedAttendance =
        lessons.length * studentIds.length;
      const attendanceFilled = lessons.reduce(
        (sum, lesson) => sum + lesson.attendance.length,
        0,
      );
      const attendanceCoverage = expectedAttendance
        ? (attendanceFilled / expectedAttendance) * 100
        : 0;

      const studentsWithGrade = new Set(
        grades.map((grade) => grade.studentId),
      );
      const missingGrades = Math.max(
        0,
        studentIds.length - studentsWithGrade.size,
      );

      let readiness = 100;
      if (lessons.length === 0) readiness -= 30;
      if (attendanceCoverage < 90) readiness -= 30;
      if (missingGrades > 0) readiness -= 30;
      if (pendingReviews + pendingJustifications > 0) readiness -= 10;

      return {
        link,
        studentCount: studentIds.length,
        lessonCount: lessons.length,
        assignmentCount: assignments,
        attendanceCoverage: pct(attendanceCoverage),
        missingGrades,
        pendingReviews,
        pendingJustifications,
        readiness: pct(readiness),
      };
    }),
  );

  const readyCount = rows.filter((row) => row.readiness >= 90).length;
  const attentionCount = rows.length - readyCount;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Operação acadêmica</h1>
          <div className="muted">
            {year.name} · {period.name} · acompanhamento de fechamento por
            turma e disciplina.
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Turma/disciplinas monitoradas</span>
          <div className="value">{rows.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Prontas para fechamento</span>
          <div className="value">{readyCount}</div>
        </div>
        <div className="kpi">
          <span className="muted">Com pendências</span>
          <div className="value">{attentionCount}</div>
        </div>
        <div className="kpi">
          <span className="muted">Período</span>
          <div className="value">{period.order}</div>
        </div>
      </div>

      {rows.map((row) => {
        const message =
          row.missingGrades > 0
            ? `${row.missingGrades} aluno(s) ainda sem nota no período.`
            : row.attendanceCoverage < 90
              ? `Cobertura de frequência em ${row.attendanceCoverage.toFixed(0)}%.`
              : row.pendingReviews + row.pendingJustifications > 0
                ? `${row.pendingReviews + row.pendingJustifications} pendência(s) de revisão/justificativa.`
                : "Revisar o diário antes do fechamento do período.";

        return (
          <section
            className="table-card"
            style={{ marginTop: 16 }}
            key={row.link.id}
          >
            <div className="page-head" style={{ marginBottom: 8 }}>
              <div>
                <h3>
                  {row.link.classGroup.name} · {row.link.subject.name}
                </h3>
                <div className="muted">
                  {row.link.teacher?.name ?? "Professor não definido"} ·{" "}
                  {row.studentCount} alunos
                </div>
              </div>
              <span className="status">
                Prontidão {row.readiness.toFixed(0)}%
              </span>
            </div>

            <div className="dashboard-grid">
              <div className="kpi">
                <span className="muted">Aulas</span>
                <div className="value">{row.lessonCount}</div>
              </div>
              <div className="kpi">
                <span className="muted">Frequência preenchida</span>
                <div className="value">
                  {row.attendanceCoverage.toFixed(0)}%
                </div>
              </div>
              <div className="kpi">
                <span className="muted">Alunos sem nota</span>
                <div className="value">{row.missingGrades}</div>
              </div>
              <div className="kpi">
                <span className="muted">Atividades</span>
                <div className="value">{row.assignmentCount}</div>
              </div>
            </div>

            <div className="table-row">
              <strong>Revisões de nota pendentes</strong>
              <span>{row.pendingReviews}</span>
            </div>
            <div className="table-row">
              <strong>Justificativas pendentes</strong>
              <span>{row.pendingJustifications}</span>
            </div>

            {canNotify && row.link.teacherId && row.readiness < 90 ? (
              <form
                action={notifyTeacherAcademicPendingAction}
                className="form-grid compact"
                style={{ marginTop: 10 }}
              >
                <input
                  type="hidden"
                  name="classSubjectId"
                  value={row.link.id}
                />
                <input
                  name="message"
                  defaultValue={message}
                  required
                />
                <button className="btn btn-light">
                  Notificar professor
                </button>
              </form>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}

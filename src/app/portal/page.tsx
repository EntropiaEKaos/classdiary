import Link from "next/link";
import { createAbsenceJustificationAction, requestGradeReviewAction } from "@/app/actions/engagement";
import { requireUser, activeOrganization } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Portal() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const guardians = await db.studentGuardian.findMany({
    where: { userId: user.id, student: { organizationId: org.id } },
    include: {
      student: {
        include: {
          grades: { include: { subject: true, reviewRequests: true } },
          attendance: {
            include: {
              lesson: { include: { subject: true, classGroup: true } },
              justifications: true,
            },
            orderBy: { lesson: { lessonDate: "desc" } },
          },
          occurrences: true,
          enrollments: { where: { active: true }, include: { classGroup: true } },
        },
      },
    },
  });

  if (!guardians.length) redirect("/dashboard");

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Portal da Família</span>
          <h1>{user.name}</h1>
          <div className="muted">{org.name}</div>
        </div>
        <div className="top-actions">
          <Link className="btn btn-light" href="/agenda">Agenda</Link>
          <Link className="btn btn-light" href="/mensagens">Mensagens</Link>
          <Link className="btn btn-light" href="/financeiro">Financeiro</Link>
          <Link className="btn btn-light" href="/notificacoes">Notificações</Link>
        </div>
      </div>

      {guardians.map((guardian) => {
        const student = guardian.student;
        const absences = student.attendance.filter((entry) => entry.status === "ABSENT");

        return (
          <section className="table-card" key={guardian.id} style={{ marginBottom: 16 }}>
            <h2>{student.name}</h2>
            <p className="muted">
              Turma: {student.enrollments[0]?.classGroup.name ?? "Não vinculada"}
            </p>

            <div className="dashboard-grid">
              <div className="kpi"><span className="muted">Notas</span><div className="value">{student.grades.length}</div></div>
              <div className="kpi"><span className="muted">Faltas</span><div className="value">{absences.length}</div></div>
              <div className="kpi"><span className="muted">Ocorrências</span><div className="value">{student.occurrences.length}</div></div>
              <div className="kpi"><span className="muted">Turmas</span><div className="value">{student.enrollments.length}</div></div>
            </div>

            <h3 style={{ marginTop: 20 }}>Notas recentes</h3>
            {student.grades.slice(-10).map((grade) => (
              <div className="notice" key={grade.id}>
                <strong>{grade.subject.name}</strong>
                <div className="muted">{grade.label} · {String(grade.value)}/{String(grade.maxValue)}</div>
                {grade.reviewRequests.some((request) => request.status === "PENDING") ? (
                  <span className="status">Revisão pendente</span>
                ) : (
                  <form action={requestGradeReviewAction} className="form-grid compact" style={{ marginTop: 8 }}>
                    <input type="hidden" name="gradeId" value={grade.id} />
                    <input name="reason" required placeholder="Motivo da revisão" />
                    <button className="btn btn-light">Solicitar revisão</button>
                  </form>
                )}
              </div>
            ))}

            <h3 style={{ marginTop: 20 }}>Faltas</h3>
            {absences.map((absence) => {
              const justification = absence.justifications[0];
              return (
                <div className="notice" key={absence.id}>
                  <strong>{absence.lesson.subject.name} · {absence.lesson.classGroup.name}</strong>
                  <div className="muted">{absence.lesson.lessonDate.toLocaleDateString("pt-BR")}</div>
                  {justification ? (
                    <span className="status">{justification.status}</span>
                  ) : (
                    <form action={createAbsenceJustificationAction} className="form-grid" style={{ marginTop: 8 }}>
                      <input type="hidden" name="attendanceId" value={absence.id} />
                      <input name="reason" required placeholder="Motivo da falta" />
                      <input name="attachmentUrl" type="url" placeholder="Link do comprovante (opcional)" />
                      <button className="btn btn-light">Enviar justificativa</button>
                    </form>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}

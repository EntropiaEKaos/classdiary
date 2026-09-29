import Link from "next/link";
import { createAbsenceJustificationAction, requestGradeReviewAction } from "@/app/actions/engagement";
import { answerGuardianAuthorizationAction } from "@/app/actions/operations-next";
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
              justification: true,
            },
            orderBy: { lesson: { lessonDate: "desc" } },
          },
          occurrences: true,
          enrollments: { where: { active: true }, include: { classGroup: true } },
          pedagogicalObservations: { where: { visibility: "FAMILY" }, include: { author: true }, orderBy: { createdAt: "desc" } },
          guardianAuthorizations: { orderBy: { requestedAt: "desc" } },
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
          <Link className="btn btn-light" href="/pesquisas">Pesquisas</Link>
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

            <h3 style={{ marginTop: 20 }}>Acompanhamento pedagógico</h3>
            {student.pedagogicalObservations.length === 0 ? <p className="muted">Nenhuma observação compartilhada pela equipe.</p> : student.pedagogicalObservations.slice(0,10).map((observation) => <div className="notice" key={observation.id}><strong>{observation.category}</strong><div>{observation.note}</div><small className="muted">{observation.author.name} · {observation.createdAt.toLocaleDateString("pt-BR")}</small></div>)}

            <h3 style={{ marginTop: 20 }}>Autorizações</h3>
            {student.guardianAuthorizations.length === 0 ? <p className="muted">Nenhuma autorização pendente.</p> : student.guardianAuthorizations.map((authorization) => <div className="notice" key={authorization.id}><strong>{authorization.title}</strong><div className="muted">{authorization.type} · {authorization.status}</div>{authorization.description ? <p>{authorization.description}</p> : null}{authorization.status === "PENDING" ? <form action={answerGuardianAuthorizationAction} className="form-grid compact"><input type="hidden" name="id" value={authorization.id}/><button className="btn btn-primary" name="decision" value="APPROVED">Autorizar</button><button className="btn btn-light" name="decision" value="REJECTED">Recusar</button></form> : <span className="status">{authorization.status}</span>}</div>)}

            <h3 style={{ marginTop: 20 }}>Faltas</h3>
            {absences.map((absence) => {
              const justification = absence.justification;
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

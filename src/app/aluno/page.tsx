import Link from "next/link";
import { createAbsenceJustificationAction, requestGradeReviewAction } from "@/app/actions/engagement";
import { submitAssignmentAction } from "@/app/actions/learning";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/login");

  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
    include: {
      student: {
        include: {
          enrollments: { where: { active: true }, include: { classGroup: true } },
          grades: { include: { subject: true, reviewRequests: true } },
          attendance: {
            include: {
              lesson: { include: { subject: true, classGroup: true } },
              justifications: true,
            },
            orderBy: { lesson: { lessonDate: "desc" } },
          },
          submissions: true,
        },
      },
    },
  });

  if (!link) redirect("/dashboard");

  const classIds = link.student.enrollments.map((enrollment) => enrollment.classGroupId);

  const tasks = await db.assignment.findMany({
    where: { organizationId: org.id, classGroupId: { in: classIds } },
    include: {
      subject: true,
      submissions: { where: { studentId: link.studentId } },
    },
    orderBy: { dueAt: "asc" },
  });

  const absences = link.student.attendance.filter((entry) => entry.status === "ABSENT");

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Portal do Aluno</span>
          <h1>{link.student.name}</h1>
          <div className="muted">{org.name}</div>
        </div>
        <div className="top-actions">
          <Link className="btn btn-light" href="/agenda">Minha agenda</Link>
          <Link className="btn btn-light" href="/mensagens">Mensagens</Link>
          <Link className="btn btn-light" href="/financeiro">Financeiro</Link>
          <Link className="btn btn-light" href="/pesquisas">Pesquisas</Link>
          <Link className="btn btn-light" href="/provas">Provas</Link>
          <Link className="btn btn-light" href="/notificacoes">Notificações</Link>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi"><span className="muted">Atividades</span><div className="value">{tasks.length}</div></div>
        <div className="kpi"><span className="muted">Entregues</span><div className="value">{tasks.filter((task) => task.submissions.length).length}</div></div>
        <div className="kpi"><span className="muted">Faltas</span><div className="value">{absences.length}</div></div>
        <div className="kpi"><span className="muted">Notas</span><div className="value">{link.student.grades.length}</div></div>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Notas recentes</h3>
        {link.student.grades.slice(-10).map((grade) => (
          <div className="notice" key={grade.id}>
            <strong>{grade.subject.name} · {grade.label}</strong>
            <div className="muted">{String(grade.value)}/{String(grade.maxValue)} · {grade.period}</div>
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
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Faltas</h3>
        {absences.length === 0 ? <p className="muted">Nenhuma falta pendente.</p> : absences.map((absence) => {
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

      {tasks.map((task) => (
        <section className="table-card" style={{ marginTop: 16 }} key={task.id}>
          <h3>{task.title}</h3>
          <p className="muted">
            {task.subject.name} · prazo {task.dueAt ? task.dueAt.toLocaleDateString("pt-BR") : "livre"}
          </p>
          <p>{task.description}</p>
          {task.submissions.length ? (
            <div>
              <span className="status">Entregue</span>
              {task.submissions[0].fileUrl ? (
                <p><a href={task.submissions[0].fileUrl} target="_blank">Abrir anexo enviado</a></p>
              ) : null}
            </div>
          ) : (
            <form action={submitAssignmentAction} className="form-stack">
              <input type="hidden" name="assignmentId" value={task.id} />
              <input name="content" required placeholder="Digite sua resposta ou observação" />
              <input name="fileUrl" type="url" placeholder="Link do arquivo/anexo (opcional)" />
              <button className="btn btn-primary">Entregar atividade</button>
            </form>
          )}
        </section>
      ))}
    </main>
  );
}

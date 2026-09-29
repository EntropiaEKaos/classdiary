import { requestExamReviewAction, startExamAttemptAction } from "@/app/actions/assessments";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
    include: {
      student: {
        include: {
          enrollments: { where: { active: true } },
        },
      },
    },
  });

  if (!link) redirect("/dashboard");

  const classIds = link.student.enrollments.map((e) => e.classGroupId);

  const exams = await db.exam.findMany({
    where: {
      organizationId: org.id,
      published: true,
      classGroupId: { in: classIds },
      OR: [
        { restrictedAccess: false },
        {
          attemptAllowances: {
            some: {
              studentId: link.studentId,
              active: true,
              OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
            },
          },
        },
      ],
    },
    include: {
      subject: true,
      classGroup: true,
      attempts: {
        where: { studentId: link.studentId },
        orderBy: { startedAt: "desc" },
        include: {
          reviewRequests: {
            where: { studentId: link.studentId },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      attemptAllowances: {
        where: {
          studentId: link.studentId,
          active: true,
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
      },
      recoveryTargetCases: {
        where: { studentId: link.studentId },
      },
    },
    orderBy: { startsAt: "desc" },
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Provas online</h1>
          <div className="muted">
            Avaliações, segunda chamada e recuperações disponíveis.
          </div>
        </div>
      </div>

      {exams.map((exam) => {
        const extra = exam.attemptAllowances.reduce(
          (sum, allowance) => sum + allowance.extraAttempts,
          0,
        );
        const allowed = (exam.restrictedAccess ? 0 : exam.maxAttempts) + extra;
        const latest = exam.attempts[0];
        const canStart = exam.attempts.length < allowed;
        const latestReview = latest?.reviewRequests[0];

        return (
          <section className="table-card" style={{ marginBottom: 16 }} key={exam.id}>
            <div className="page-head" style={{ marginBottom: 8 }}>
              <div>
                <h3>{exam.title}</h3>
                <p className="muted">
                  {exam.subject.name} · {exam.classGroup.name} · {exam.type}
                  {exam.restrictedAccess ? " · acesso individual" : ""}
                </p>
              </div>
              {exam.recoveryTargetCases.length ? (
                <span className="status">Recuperação</span>
              ) : null}
            </div>

            {exam.description ? <p>{exam.description}</p> : null}
            <div>
              {exam.attempts.length}/{allowed} tentativa(s) disponíveis
            </div>

            {latest?.status === "GRADED" ? (
              <div className="notice" style={{ marginTop: 8 }}>
                <strong>
                  Nota {String(latest.finalScore)} · versão {latest.variantCode ?? "A"}
                </strong>
                <div className="muted">
                  Integridade {Math.max(0, latest.integrityScore)}%
                </div>

                {latestReview ? (
                  <p>
                    Revisão: <strong>{latestReview.status}</strong>
                    {latestReview.response ? " · " + latestReview.response : ""}
                  </p>
                ) : (
                  <form action={requestExamReviewAction} className="form-grid compact">
                    <input type="hidden" name="attemptId" value={latest.id} />
                    <input
                      name="reason"
                      required
                      minLength={5}
                      placeholder="Motivo da solicitação de revisão"
                    />
                    <button className="btn btn-light">Solicitar revisão</button>
                  </form>
                )}
              </div>
            ) : latest ? (
              <span className="status">{latest.status}</span>
            ) : null}

            {canStart ? (
              <form action={startExamAttemptAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="examId" value={exam.id} />
                <button className="btn btn-primary">
                  {exam.recoveryTargetCases.length ? "Iniciar recuperação" : "Iniciar prova"}
                </button>
              </form>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}

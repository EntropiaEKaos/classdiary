import { submitExamAttemptAction } from "@/app/actions/assessments";
import { ExamIntegrityMonitor } from "@/components/exam-integrity-monitor";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ examId: string; attemptId: string }>;
}) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const { examId, attemptId } = await params;
  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
  });
  if (!link) notFound();

  const attempt = await db.examAttempt.findFirst({
    where: {
      id: attemptId,
      examId,
      studentId: link.studentId,
      organizationId: org.id,
      status: "IN_PROGRESS",
    },
    include: {
      exam: {
        include: {
          questions: {
            include: { question: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });
  if (!attempt) notFound();

  const order = Array.isArray(attempt.questionOrder)
    ? attempt.questionOrder.map(String)
    : [];
  const byId = new Map(attempt.exam.questions.map((q) => [q.id, q]));
  const orderedQuestions = order.length
    ? order.map((id) => byId.get(id)).filter(Boolean) as typeof attempt.exam.questions
    : attempt.exam.questions;

  return (
    <main className="main">
      <ExamIntegrityMonitor attemptId={attempt.id} />
      <div className="page-head">
        <div>
          <h1>{attempt.exam.title}</h1>
          <div className="muted">
            Versão {attempt.variantCode ?? "A"} ·{" "}
            {attempt.exam.durationMinutes
              ? attempt.exam.durationMinutes + " minutos"
              : "Sem limite configurado"}
          </div>
        </div>
        <span className="status">Integridade monitorada</span>
      </div>

      <div className="notice">
        Durante a prova o sistema registra sinais como troca de aba, perda de foco,
        copiar e colar. Esses sinais servem para auditoria e não determinam, isoladamente,
        qualquer conclusão sobre fraude.
      </div>

      <form action={submitExamAttemptAction} className="form-stack">
        <input type="hidden" name="attemptId" value={attempt.id} />
        {orderedQuestions.map((eq, index) => (
          <section className="table-card" key={eq.id}>
            <h3>
              {index + 1}. {eq.question.prompt}
            </h3>
            <p className="muted">Valor: {String(eq.points)}</p>

            {eq.question.type === "MULTIPLE_CHOICE" ? (
              <select name={"q_" + eq.id}>
                {Array.isArray(eq.question.options)
                  ? eq.question.options.map((opt, i) => (
                      <option key={i} value={String(opt)}>
                        {String(opt)}
                      </option>
                    ))
                  : null}
              </select>
            ) : eq.question.type === "TRUE_FALSE" ? (
              <select name={"q_" + eq.id}>
                <option value="TRUE">Verdadeiro</option>
                <option value="FALSE">Falso</option>
              </select>
            ) : (
              <textarea
                name={"q_" + eq.id}
                rows={eq.question.type === "ESSAY" ? 8 : 3}
                placeholder="Sua resposta"
              />
            )}
          </section>
        ))}

        <button className="btn btn-primary">Entregar prova</button>
      </form>
    </main>
  );
}

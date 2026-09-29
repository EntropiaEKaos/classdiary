import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ examId?: string }>;
}) {
  const { user, org } = await requireModulePermission("assessments", "view");
  const params = await searchParams;
  const membership = user.memberships.find((m) => m.organizationId === org.id);
  const teacherOnly = membership?.role === "TEACHER";

  const exams = await db.exam.findMany({
    where: {
      organizationId: org.id,
      ...(teacherOnly ? { authorId: user.id } : {}),
    },
    include: {
      classGroup: true,
      subject: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const selectedId = params.examId || exams[0]?.id;

  const exam = selectedId
    ? await db.exam.findFirst({
        where: {
          id: selectedId,
          organizationId: org.id,
          ...(teacherOnly ? { authorId: user.id } : {}),
        },
        include: {
          classGroup: {
            include: {
              enrollments: {
                where: { active: true },
                include: { student: true },
              },
            },
          },
          subject: true,
          questions: {
            include: {
              question: true,
              competencies: { include: { competency: true } },
              answers: {
                include: {
                  attempt: {
                    include: { student: true },
                  },
                },
              },
            },
            orderBy: { position: "asc" },
          },
          attempts: {
            include: { student: true },
            orderBy: { startedAt: "desc" },
          },
        },
      })
    : null;

  if (!exam) {
    return (
      <main className="main">
        <div className="page-head">
          <div>
            <h1>Desempenho em provas</h1>
            <div className="muted">Nenhuma prova disponível.</div>
          </div>
        </div>
      </main>
    );
  }

  const graded = exam.attempts.filter((attempt) => attempt.status === "GRADED");
  const totalPossible = exam.questions.reduce(
    (sum, question) => sum + Number(question.points),
    0,
  );
  const average = graded.length
    ? graded.reduce((sum, attempt) => sum + Number(attempt.finalScore), 0) /
      graded.length
    : 0;
  const completion = exam.classGroup.enrollments.length
    ? (graded.length / exam.classGroup.enrollments.length) * 100
    : 0;

  const competencyMap = new Map<
    string,
    { code: string; title: string; total: number; correct: number }
  >();

  for (const question of exam.questions) {
    for (const link of question.competencies) {
      const current = competencyMap.get(link.competency.id) ?? {
        code: link.competency.code,
        title: link.competency.title,
        total: 0,
        correct: 0,
      };

      const objectiveAnswers = question.answers.filter(
        (answer) => answer.autoCorrect !== null,
      );
      current.total += objectiveAnswers.length;
      current.correct += objectiveAnswers.filter(
        (answer) => answer.autoCorrect === true,
      ).length;
      competencyMap.set(link.competency.id, current);
    }
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Desempenho em provas</h1>
          <div className="muted">
            Resultados por turma, aluno e habilidade.
          </div>
        </div>
        <form>
          <select name="examId" defaultValue={exam.id}>
            {exams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.classGroup.name}
              </option>
            ))}
          </select>
          <button className="btn btn-light">Abrir</button>
        </form>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Turma</span>
          <div className="value">{exam.classGroup.name}</div>
        </div>
        <div className="kpi">
          <span className="muted">Média</span>
          <div className="value">
            {average.toFixed(2)} / {totalPossible.toFixed(2)}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Conclusão</span>
          <div className="value">{completion.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <span className="muted">Aguardando correção</span>
          <div className="value">
            {exam.attempts.filter((attempt) => attempt.status === "PENDING_REVIEW").length}
          </div>
        </div>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Resultados por aluno</h3>
        {exam.classGroup.enrollments.map((enrollment) => {
          const attempts = exam.attempts.filter(
            (attempt) => attempt.studentId === enrollment.studentId,
          );
          const best = attempts
            .filter((attempt) => attempt.status === "GRADED")
            .sort(
              (a, b) =>
                Number(b.finalScore) - Number(a.finalScore),
            )[0];

          return (
            <div className="table-row" key={enrollment.id}>
              <strong>{enrollment.student.name}</strong>
              <span>{attempts.length} tentativa(s)</span>
              <span>
                {best
                  ? `${Number(best.finalScore).toFixed(2)} / ${totalPossible.toFixed(2)}`
                  : "Sem nota"}
              </span>
            </div>
          );
        })}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Desempenho por habilidade</h3>
        {[...competencyMap.values()].map((item) => {
          const accuracy = item.total
            ? (item.correct / item.total) * 100
            : 0;
          return (
            <div className="table-row" key={item.code}>
              <strong>
                {item.code} · {item.title}
              </strong>
              <span>{item.total} respostas objetivas</span>
              <span>{accuracy.toFixed(1)}% de acerto</span>
            </div>
          );
        })}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Questões</h3>
        {exam.questions.map((question) => {
          const objective = question.answers.filter(
            (answer) => answer.autoCorrect !== null,
          );
          const correct = objective.filter(
            (answer) => answer.autoCorrect === true,
          ).length;
          const accuracy = objective.length
            ? (correct / objective.length) * 100
            : 0;

          return (
            <div className="table-row" key={question.id}>
              <strong>
                {question.position}. {question.question.prompt}
              </strong>
              <span>{question.question.difficulty}</span>
              <span>
                {objective.length
                  ? accuracy.toFixed(1) + "% de acerto"
                  : "Correção manual"}
              </span>
            </div>
          );
        })}
      </section>
    </main>
  );
}

import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const { org } = await requireModulePermission("assessments", "view");
  const params = await searchParams;
  const students = await db.student.findMany({ where: { organizationId: org.id, active: true }, orderBy: { name: "asc" } });
  const studentId = params.studentId || students[0]?.id;

  const attempts = studentId ? await db.examAttempt.findMany({
    where: { organizationId: org.id, studentId, status: "GRADED" },
    include: { exam: { include: { subject: true, academicPeriod: { include: { schoolYear: true } }, questions: true } } },
    orderBy: { submittedAt: "asc" },
  }) : [];

  const student = students.find((s) => s.id === studentId);
  const normalized = attempts.map((a) => {
    const max = a.exam.questions.reduce((sum, q) => sum + Number(q.points), 0);
    return { attempt: a, score: max ? (Number(a.finalScore) / max) * 10 : 0 };
  });

  return <main className="main">
    <div className="page-head"><div><h1>Evolução em avaliações</h1><div className="muted">Comparação longitudinal das provas ao longo do ano.</div></div><form><select name="studentId" defaultValue={studentId}>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="btn btn-light">Abrir</button></form></div>
    <section className="table-card">
      <h3>{student?.name ?? "Aluno"}</h3>
      {normalized.length === 0 ? <p className="muted">Sem avaliações corrigidas.</p> : normalized.map(({ attempt, score }, index) => {
        const previous = index > 0 ? normalized[index - 1].score : null;
        const delta = previous === null ? null : score - previous;
        return <div className="table-row" key={attempt.id}><strong>{attempt.exam.academicPeriod?.schoolYear.name ?? "—"} · {attempt.exam.academicPeriod?.name ?? "Sem período"} · {attempt.exam.title}</strong><span>{attempt.exam.subject.name} · versão {attempt.variantCode ?? "—"}</span><span>{score.toFixed(2)}{delta !== null ? ` · ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : ""}</span></div>;
      })}
    </section>
  </main>;
}

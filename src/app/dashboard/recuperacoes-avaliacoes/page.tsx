import { generateRecoveryExamAction } from "@/app/actions/assessments";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("assessments", "view");
  const membership = user.memberships.find((m) => m.organizationId === org.id);
  const teacherOnly = membership?.role === "TEACHER";

  const cases = await db.examRecoveryCase.findMany({
    where: {
      organizationId: org.id,
      ...(teacherOnly ? { originalExam: { authorId: user.id } } : {}),
    },
    include: {
      student: true,
      originalExam: { include: { subject: true, classGroup: true } },
      recoveryExam: true,
    },
    orderBy: { generatedAt: "desc" },
  });

  return <main className="main">
    <div className="page-head"><div><h1>Recuperações de avaliação</h1><div className="muted">Elegibilidade automática baseada na média configurada da escola.</div></div></div>
    {cases.length === 0 ? <section className="table-card"><p className="muted">Nenhum caso de recuperação.</p></section> : cases.map((item) =>
      <section className="table-card" style={{ marginBottom: 16 }} key={item.id}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <div><h3>{item.student.name}</h3><div className="muted">{item.originalExam.subject.name} · {item.originalExam.classGroup.name} · {item.originalExam.title}</div></div>
          <span className="status">{item.status}</span>
        </div>
        <p>Desempenho original: {Number(item.originalPercent).toFixed(1)}% · corte: {Number(item.threshold).toFixed(1)}%</p>
        {item.recoveryExam ? <p><strong>Prova de recuperação:</strong> {item.recoveryExam.title}</p> : item.status === "ELIGIBLE" ?
          <form action={generateRecoveryExamAction}><input type="hidden" name="caseId" value={item.id}/><button className="btn btn-primary">Gerar recuperação individual</button></form> : null}
      </section>
    )}
  </main>;
}

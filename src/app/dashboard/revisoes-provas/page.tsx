import { reviewExamRequestAction } from "@/app/actions/assessments";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("assessments", "view");
  const membership = user.memberships.find((m) => m.organizationId === org.id);
  const teacherOnly = membership?.role === "TEACHER";

  const requests = await db.examReviewRequest.findMany({
    where: { organizationId: org.id, ...(teacherOnly ? { exam: { authorId: user.id } } : {}) },
    include: { student: true, exam: true, attempt: true, createdBy: true, reviewedBy: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return <main className="main">
    <div className="page-head"><div><h1>Revisões formais de prova</h1><div className="muted">Solicitações abertas por alunos para revisão da avaliação.</div></div></div>
    {requests.length === 0 ? <section className="table-card"><p className="muted">Nenhuma solicitação.</p></section> : requests.map((r) =>
      <section className="table-card" style={{ marginBottom: 16 }} key={r.id}>
        <div className="page-head" style={{ marginBottom: 8 }}><div><h3>{r.student.name} · {r.exam.title}</h3><div className="muted">Nota atual {String(r.attempt.finalScore)} · solicitado por {r.createdBy.name}</div></div><span className="status">{r.status}</span></div>
        <p>{r.reason}</p>
        {r.status === "PENDING" ? <form action={reviewExamRequestAction} className="form-grid compact"><input type="hidden" name="id" value={r.id}/><input name="response" required placeholder="Resposta da revisão"/><button className="btn btn-primary" name="status" value="APPROVED">Aprovar revisão</button><button className="btn btn-light" name="status" value="REJECTED">Rejeitar</button></form> : <p><strong>Resposta:</strong> {r.response}</p>}
      </section>
    )}
  </main>;
}

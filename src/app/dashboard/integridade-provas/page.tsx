import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("assessments", "view");
  const membership = user.memberships.find((m) => m.organizationId === org.id);
  const teacherOnly = membership?.role === "TEACHER";

  const attempts = await db.examAttempt.findMany({
    where: { organizationId: org.id, ...(teacherOnly ? { exam: { authorId: user.id } } : {}), integrityEvents: { some: {} } },
    include: { student: true, exam: true, integrityEvents: { orderBy: { createdAt: "asc" } } },
    orderBy: { startedAt: "desc" },
    take: 300,
  });

  return <main className="main">
    <div className="page-head"><div><h1>Integridade das provas</h1><div className="muted">Sinais básicos de comportamento durante avaliações online. Não são prova conclusiva de fraude.</div></div></div>
    {attempts.length === 0 ? <section className="table-card"><p className="muted">Nenhum evento de integridade registrado.</p></section> : attempts.map((a) =>
      <section className="table-card" style={{ marginBottom: 16 }} key={a.id}>
        <div className="page-head" style={{ marginBottom: 8 }}><div><h3>{a.student.name} · {a.exam.title}</h3><div className="muted">Versão {a.variantCode ?? "—"} · tentativa {a.startedAt.toLocaleString("pt-BR")}</div></div><span className="status">Integridade {Math.max(0, a.integrityScore)}%</span></div>
        {a.integrityEvents.map((event) => <div className="table-row" key={event.id}><strong>{event.type}</strong><span>{event.createdAt.toLocaleString("pt-BR")}</span><span>-{event.penalty}</span></div>)}
      </section>
    )}
  </main>;
}

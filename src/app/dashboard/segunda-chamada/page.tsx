import { grantExamAttemptAllowanceAction } from "@/app/actions/assessments";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("assessments", "view");
  const membership = user.memberships.find((m) => m.organizationId === org.id);
  const teacherOnly = membership?.role === "TEACHER";

  const [exams, students, allowances] = await Promise.all([
    db.exam.findMany({ where: { organizationId: org.id, published: true, ...(teacherOnly ? { authorId: user.id } : {}) }, include: { classGroup: true, subject: true }, orderBy: { createdAt: "desc" } }),
    db.student.findMany({ where: { organizationId: org.id, active: true }, orderBy: { name: "asc" } }),
    db.examAttemptAllowance.findMany({ where: { organizationId: org.id, ...(teacherOnly ? { exam: { authorId: user.id } } : {}) }, include: { exam: true, student: true, grantedBy: true }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Segunda chamada e substitutiva</h1><div className="muted">Concessão individual de tentativas extras.</div></div></div>
    <section className="table-card">
      <form action={grantExamAttemptAllowanceAction} className="form-grid">
        <select name="examId">{exams.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.classGroup.name}</option>)}</select>
        <select name="studentId">{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="type"><option value="SECOND_CALL">Segunda chamada</option><option value="SUBSTITUTE">Substitutiva</option><option value="EXTRA_ATTEMPT">Tentativa extra</option></select>
        <input name="extraAttempts" type="number" min="1" max="3" defaultValue="1"/>
        <input name="reason" required placeholder="Motivo"/>
        <input name="validUntil" type="datetime-local"/>
        <button className="btn btn-primary">Autorizar</button>
      </form>
    </section>
    <section className="table-card" style={{ marginTop: 16 }}>
      {allowances.map((a) => <div className="table-row" key={a.id}><strong>{a.student.name} · {a.type}</strong><span>{a.exam.title} · +{a.extraAttempts} tentativa(s)</span><span>{a.active ? "Ativa" : "Inativa"} · {a.grantedBy.name}</span></div>)}
    </section>
  </main>;
}

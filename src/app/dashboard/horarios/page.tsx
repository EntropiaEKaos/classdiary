import { createTimetableEntryAction } from "@/app/actions/configuration";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const days = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);
  const [classes, subjects, teachers, entries] = await Promise.all([
    db.classGroup.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    db.subject.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    db.membership.findMany({
      where: { organizationId: org.id, role: "TEACHER" },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.timetableEntry.findMany({
      where: { organizationId: org.id },
      include: { classGroup: true, subject: true, teacher: true },
      orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
    }),
  ]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Quadro de horários</h1>
          <div className="muted">Turmas, disciplinas e professores por dia da semana.</div>
        </div>
      </div>

      <section className="table-card">
        <form action={createTimetableEntryAction} className="form-grid compact">
          <select name="classGroupId">{classes.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
          <select name="subjectId">{subjects.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select>
          <select name="teacherId"><option value="">Sem professor</option>{teachers.map((t) => <option value={t.user.id} key={t.user.id}>{t.user.name}</option>)}</select>
          <select name="weekday">{days.slice(1).map((d, i) => <option value={i + 1} key={d}>{d}</option>)}</select>
          <input name="startsAt" type="time" required />
          <input name="endsAt" type="time" required />
          <button className="btn btn-primary">Adicionar horário</button>
        </form>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        {entries.length === 0 ? <p className="muted">Nenhum horário cadastrado.</p> : entries.map((e) => (
          <div className="table-row" key={e.id}>
            <strong>{days[e.weekday]} · {e.startsAt}–{e.endsAt}</strong>
            <span>{e.classGroup.name} · {e.subject.name}</span>
            <span>{e.teacher?.name ?? "Sem professor"}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

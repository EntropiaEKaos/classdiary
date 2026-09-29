import Link from "next/link";
import { redirect } from "next/navigation";
import { activeOrganization } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function average(grades: { value: unknown; maxValue: unknown; weight: unknown }[]) {
  const totalWeight = grades.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (!totalWeight) return 0;

  return grades.reduce(
    (sum, grade) =>
      sum +
      ((Number(grade.value) / Number(grade.maxValue)) * 10) *
        Number(grade.weight),
    0,
  ) / totalWeight;
}

export default async function Dashboard() {
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const now = new Date();

  const [students, classes, teachers, lessons, monitored, assignments, events, announcements] =
    await Promise.all([
      db.student.count({ where: { organizationId: org.id, active: true } }),
      db.classGroup.count({ where: { organizationId: org.id } }),
      db.membership.count({ where: { organizationId: org.id, role: "TEACHER" } }),
      db.lesson.count({ where: { classGroup: { organizationId: org.id } } }),
      db.student.findMany({
        where: { organizationId: org.id, active: true },
        include: { attendance: true, grades: true },
        take: 500,
      }),
      db.assignment.findMany({
        where: {
          organizationId: org.id,
          dueAt: { gte: now },
        },
        include: { classGroup: true, subject: true },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      db.academicEvent.findMany({
        where: {
          organizationId: org.id,
          startsAt: { gte: now },
        },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      db.announcement.findMany({
        where: { organizationId: org.id },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
    ]);

  const riskCount = monitored.filter((student) => {
    const totalAttendance = student.attendance.length;
    const attended = student.attendance.filter(
      (entry) => entry.status === "PRESENT" || entry.status === "LATE",
    ).length;
    const attendancePercent = totalAttendance
      ? (attended / totalAttendance) * 100
      : 100;
    const gradeAverage = average(student.grades);

    return (
      attendancePercent < org.attendanceWarningPercent ||
      (student.grades.length > 0 && gradeAverage < Number(org.passingGrade))
    );
  }).length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <div className="muted">Acompanhamento em tempo real de {org.name}</div>
        </div>
        <Link className="btn btn-light" href="/dashboard/relatorios">
          Ver relatório completo
        </Link>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Alunos ativos</span>
          <div className="value">{students}</div>
        </div>
        <div className="kpi">
          <span className="muted">Turmas</span>
          <div className="value">{classes}</div>
        </div>
        <div className="kpi">
          <span className="muted">Professores</span>
          <div className="value">{teachers}</div>
        </div>
        <div className="kpi">
          <span className="muted">Alunos em alerta</span>
          <div className="value">{riskCount}</div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <div className="page-head" style={{ marginBottom: 8 }}>
            <div>
              <strong>Próximas atividades</strong>
              <div className="muted">{lessons} aulas registradas no total</div>
            </div>
          </div>
          {assignments.length === 0 ? (
            <p className="muted">Nenhuma atividade futura cadastrada.</p>
          ) : (
            assignments.map((assignment) => (
              <div className="table-row" key={assignment.id}>
                <strong>{assignment.title}</strong>
                <span>{assignment.classGroup.name} · {assignment.subject.name}</span>
                <span>{assignment.dueAt?.toLocaleDateString("pt-BR") ?? "Sem prazo"}</span>
              </div>
            ))
          )}
        </section>

        <section className="table-card">
          <strong>Agenda</strong>
          {events.length === 0 ? (
            <p className="muted">Nenhum evento futuro.</p>
          ) : (
            events.map((event) => (
              <div className="notice" key={event.id}>
                <b>{event.title}</b>
                <div className="muted">
                  {event.startsAt.toLocaleString("pt-BR")}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <strong>Comunicados recentes</strong>
          <Link href="/dashboard/comunicados" className="muted">Ver todos</Link>
        </div>
        {announcements.length === 0 ? (
          <p className="muted">Nenhum comunicado publicado.</p>
        ) : (
          announcements.map((announcement) => (
            <div className="notice" key={announcement.id}>
              <b>{announcement.title}</b>
              <div className="muted">{announcement.body}</div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

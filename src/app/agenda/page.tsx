import Link from "next/link";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const days = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default async function Page() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const isTeacher = roles.includes("TEACHER");
  const isStudent = roles.includes("STUDENT");
  const isGuardian = roles.includes("GUARDIAN");
  const isStaff = roles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role),
  );

  const classIds = new Set<string>();

  if (isStudent) {
    const links = await db.studentUser.findMany({
      where: { userId: user.id, student: { organizationId: org.id } },
      include: {
        student: {
          include: {
            enrollments: { where: { active: true } },
          },
        },
      },
    });

    for (const link of links) {
      for (const enrollment of link.student.enrollments) {
        classIds.add(enrollment.classGroupId);
      }
    }
  }

  if (isGuardian) {
    const links = await db.studentGuardian.findMany({
      where: { userId: user.id, student: { organizationId: org.id } },
      include: {
        student: {
          include: {
            enrollments: { where: { active: true } },
          },
        },
      },
    });

    for (const link of links) {
      for (const enrollment of link.student.enrollments) {
        classIds.add(enrollment.classGroupId);
      }
    }
  }

  const timetable = await db.timetableEntry.findMany({
    where: {
      organizationId: org.id,
      ...(isTeacher && !isStaff
        ? { teacherId: user.id }
        : classIds.size && !isStaff
          ? { classGroupId: { in: [...classIds] } }
          : {}),
    },
    include: {
      classGroup: true,
      subject: true,
      teacher: true,
    },
    orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
  });

  const now = new Date();

  const assignments = await db.assignment.findMany({
    where: {
      organizationId: org.id,
      dueAt: { gte: now },
      ...(isTeacher && !isStaff
        ? { authorId: user.id }
        : classIds.size && !isStaff
          ? { classGroupId: { in: [...classIds] } }
          : {}),
    },
    include: {
      classGroup: true,
      subject: true,
    },
    orderBy: { dueAt: "asc" },
    take: 30,
  });

  const events = await db.academicEvent.findMany({
    where: {
      organizationId: org.id,
      startsAt: { gte: now },
      OR: [
        { audience: "ALL" },
        ...(isStaff ? [{ audience: "STAFF" }] : []),
        ...(isGuardian ? [{ audience: "GUARDIANS" }] : []),
        ...(isStudent ? [{ audience: "STUDENTS" }] : []),
      ],
    },
    orderBy: { startsAt: "asc" },
    take: 30,
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Agenda</span>
          <h1>Minha rotina acadêmica</h1>
          <div className="muted">{org.name}</div>
        </div>
        <div className="top-actions">
          <Link className="btn btn-light" href="/mensagens">Mensagens</Link>
          <Link className="btn btn-light" href="/notificacoes">Notificações</Link>
        </div>
      </div>

      <section className="table-card">
        <h3>Horários</h3>
        {timetable.length === 0 ? (
          <p className="muted">Nenhum horário disponível para este perfil.</p>
        ) : (
          timetable.map((entry) => (
            <div className="table-row" key={entry.id}>
              <strong>{days[entry.weekday]} · {entry.startsAt}–{entry.endsAt}</strong>
              <span>{entry.classGroup.name} · {entry.subject.name}</span>
              <span>{entry.teacher?.name ?? "Sem professor"}</span>
            </div>
          ))
        )}
      </section>

      <div className="content-grid">
        <section className="table-card">
          <h3>Próximas atividades</h3>
          {assignments.length === 0 ? (
            <p className="muted">Nenhuma atividade futura.</p>
          ) : (
            assignments.map((assignment) => (
              <div className="notice" key={assignment.id}>
                <strong>{assignment.title}</strong>
                <div className="muted">
                  {assignment.classGroup.name} · {assignment.subject.name}
                </div>
                <small>
                  {assignment.dueAt?.toLocaleString("pt-BR") ?? "Sem prazo"}
                </small>
              </div>
            ))
          )}
        </section>

        <section className="table-card">
          <h3>Eventos</h3>
          {events.length === 0 ? (
            <p className="muted">Nenhum evento futuro.</p>
          ) : (
            events.map((event) => (
              <div className="notice" key={event.id}>
                <strong>{event.title}</strong>
                <div className="muted">{event.description}</div>
                <small>{event.startsAt.toLocaleString("pt-BR")}</small>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

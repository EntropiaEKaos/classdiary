import Link from "next/link";
import { Bell, CalendarDays, ClipboardCheck, MessageCircle, Search } from "lucide-react";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MyDayPage() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) => ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role));

  const today = new Date();
  const weekday = today.getDay() === 0 ? 7 : today.getDay();
  const end = new Date(today.getTime() + 7 * 86400000);

  const [timetable, assignments, events, unreadNotifications, conversations] = await Promise.all([
    db.timetableEntry.findMany({
      where: {
        organizationId: org.id,
        weekday,
        ...(teacherOnly ? { teacherId: user.id } : {}),
      },
      include: { classGroup: true, subject: true },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    db.assignment.findMany({
      where: {
        organizationId: org.id,
        dueAt: { gte: today, lte: end },
        ...(teacherOnly ? { authorId: user.id } : {}),
      },
      include: { classGroup: true, subject: true },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    db.academicEvent.findMany({
      where: { organizationId: org.id, startsAt: { gte: today, lte: end } },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    db.notification.count({
      where: { organizationId: org.id, userId: user.id, readAt: null },
    }),
    db.conversation.findMany({
      where: {
        organizationId: org.id,
        participants: { some: { userId: user.id } },
      },
      include: {
        participants: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const unreadMessages = conversations.filter((conversation) => {
    const participant = conversation.participants.find((item) => item.userId === user.id);
    const last = conversation.messages[0];
    return Boolean(
      last &&
      last.senderId !== user.id &&
      (!participant?.lastReadAt || last.createdAt > participant.lastReadAt),
    );
  }).length;

  const roleLabel = teacherOnly
    ? "Professor"
    : roles.includes("SECRETARY")
      ? "Secretaria"
      : roles.includes("COORDINATOR")
        ? "Coordenação"
        : "Gestão";

  return (
    <main className="main">
      <div className="day-hero">
        <div>
          <span className="badge">{roleLabel}</span>
          <h1>Meu dia</h1>
          <p>Bom trabalho, {user.name.split(" ")[0]}. Aqui está o que merece sua atenção hoje.</p>
        </div>
        <div className="day-date">
          <strong>{today.toLocaleDateString("pt-BR", { weekday: "long" })}</strong>
          <span>{today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</span>
        </div>
      </div>

      <div className="quick-action-grid">
        <Link href="/dashboard/buscar">
          <Search size={19}/><span><strong>Buscar</strong><small>Aluno, turma ou pessoa</small></span>
        </Link>
        <Link href="/mensagens">
          <MessageCircle size={19}/><span><strong>Mensagens</strong><small>{unreadMessages} não lidas</small></span>
        </Link>
        <Link href="/notificacoes">
          <Bell size={19}/><span><strong>Notificações</strong><small>{unreadNotifications} pendentes</small></span>
        </Link>
        <Link href="/agenda">
          <CalendarDays size={19}/><span><strong>Agenda completa</strong><small>Horários e eventos</small></span>
        </Link>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <div className="section-title-row">
            <div><strong>Hoje</strong><span>Horários e aulas do dia</span></div>
            <CalendarDays size={19}/>
          </div>
          {timetable.length ? timetable.map((entry) => (
            <div className="day-item" key={entry.id}>
              <span className="day-time">{entry.startsAt}</span>
              <div><strong>{entry.subject.name}</strong><small>{entry.classGroup.name} · até {entry.endsAt}</small></div>
            </div>
          )) : (
            <EmptyState title="Agenda livre" description="Nenhum horário encontrado para hoje."/>
          )}
        </section>

        <section className="table-card">
          <div className="section-title-row">
            <div><strong>Próximos 7 dias</strong><span>Eventos importantes</span></div>
            <ClipboardCheck size={19}/>
          </div>
          {events.length ? events.map((event) => (
            <div className="notice" key={event.id}>
              <strong>{event.title}</strong>
              <div className="muted">{event.description}</div>
              <small>{event.startsAt.toLocaleString("pt-BR")}</small>
            </div>
          )) : (
            <EmptyState title="Sem eventos" description="Nenhum evento previsto para os próximos dias."/>
          )}
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <div className="section-title-row">
          <div><strong>Atividades próximas</strong><span>Prazos para acompanhar</span></div>
        </div>
        {assignments.length ? assignments.map((assignment) => (
          <div className="table-row" key={assignment.id}>
            <strong>{assignment.title}</strong>
            <span>{assignment.classGroup.name} · {assignment.subject.name}</span>
            <span>{assignment.dueAt?.toLocaleDateString("pt-BR")}</span>
          </div>
        )) : (
          <EmptyState title="Tudo em dia" description="Nenhuma atividade com prazo nos próximos 7 dias."/>
        )}
      </section>
    </main>
  );
}

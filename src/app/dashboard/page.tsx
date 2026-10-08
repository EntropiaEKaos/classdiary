import Link from "next/link";
import { CalendarCheck2, MessageCircle, Search, UserPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function average(
  grades: { value: unknown; maxValue: unknown; weight: unknown }[],
) {
  const totalWeight = grades.reduce(
    (sum, grade) => sum + Number(grade.weight),
    0,
  );

  if (!totalWeight) return 0;

  return (
    grades.reduce(
      (sum, grade) =>
        sum +
        ((Number(grade.value) / Number(grade.maxValue)) * 10) *
          Number(grade.weight),
      0,
    ) / totalWeight
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const isStaff = roles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY", "TEACHER"].includes(role),
  );

  if (!isStaff) {
    if (roles.includes("STUDENT")) redirect("/aluno");
    if (roles.includes("GUARDIAN")) redirect("/portal");
    redirect("/onboarding");
  }

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) =>
      ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role),
    );

  const canViewReports = await hasModulePermission("reports", "view");
  const now = new Date();

  const teacherClassSubjects = teacherOnly
    ? await db.classSubject.findMany({
        where: {
          teacherId: user.id,
          classGroup: { organizationId: org.id },
        },
        select: { classGroupId: true },
      })
    : [];

  const teacherClassIds = [
    ...new Set(teacherClassSubjects.map((item) => item.classGroupId)),
  ];

  const studentScope = teacherOnly
    ? {
        enrollments: {
          some: {
            active: true,
            classGroupId: { in: teacherClassIds },
          },
        },
      }
    : {};

  const classScope = teacherOnly
    ? { id: { in: teacherClassIds } }
    : {};

  const [
    students,
    classes,
    teachers,
    lessons,
    monitored,
    assignments,
    events,
    announcements,
  ] = await Promise.all([
    db.student.count({
      where: {
        organizationId: org.id,
        active: true,
        ...studentScope,
      },
    }),
    db.classGroup.count({
      where: {
        organizationId: org.id,
        ...classScope,
      },
    }),
    teacherOnly
      ? Promise.resolve(1)
      : db.membership.count({
          where: { organizationId: org.id, role: "TEACHER" },
        }),
    db.lesson.count({
      where: {
        classGroup: {
          organizationId: org.id,
          ...(teacherOnly ? { id: { in: teacherClassIds } } : {}),
        },
        ...(teacherOnly ? { teacherId: user.id } : {}),
      },
    }),
    canViewReports
      ? db.student.findMany({
          where: {
            organizationId: org.id,
            active: true,
            ...studentScope,
          },
          include: {
            attendance: teacherOnly
              ? {
                  where: {
                    lesson: {
                      classGroupId: { in: teacherClassIds },
                    },
                  },
                }
              : true,
            grades: teacherOnly
              ? {
                  where: {
                    classGroupId: { in: teacherClassIds },
                  },
                }
              : true,
          },
          take: 500,
        })
      : Promise.resolve([]),
    db.assignment.findMany({
      where: {
        organizationId: org.id,
        dueAt: { gte: now },
        ...(teacherOnly
          ? { classGroupId: { in: teacherClassIds }, authorId: user.id }
          : {}),
      },
      include: { classGroup: true, subject: true },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
    db.academicEvent.findMany({
      where: {
        organizationId: org.id,
        startsAt: { gte: now },
        OR: [
          { audience: "ALL" },
          { audience: "STAFF" },
        ],
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

  const riskCount = canViewReports
    ? monitored.filter((student) => {
        const totalAttendance = student.attendance.length;
        const attended = student.attendance.filter((entry) =>
          ["PRESENT", "LATE", "EXCUSED"].includes(entry.status),
        ).length;

        const attendancePercent = totalAttendance
          ? (attended / totalAttendance) * 100
          : 100;

        const gradeAverage = average(student.grades);

        return (
          attendancePercent < org.attendanceWarningPercent ||
          (student.grades.length > 0 &&
            gradeAverage < Number(org.passingGrade))
        );
      }).length
    : null;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <div className="muted">
            {teacherOnly
              ? "Suas turmas e atividades em " + org.name
              : "Acompanhamento em tempo real de " + org.name}
          </div>
        </div>

        {canViewReports ? (
          <Link className="btn btn-light" href="/dashboard/relatorios">
            Ver relatório completo
          </Link>
        ) : null}
      </div>

      <div className="dashboard-role-actions">
        <Link href="/dashboard/meu-dia"><CalendarCheck2 size={18}/><span><strong>Meu dia</strong><small>Prioridades e agenda</small></span></Link>
        <Link href="/dashboard/buscar"><Search size={18}/><span><strong>Busca global</strong><small>Encontre qualquer registro</small></span></Link>
        <Link href="/mensagens"><MessageCircle size={18}/><span><strong>Mensagens</strong><small>Comunicação da escola</small></span></Link>
        {!teacherOnly ? <Link href="/dashboard/alunos"><UserPlus size={18}/><span><strong>Alunos</strong><small>Cadastros e matrículas</small></span></Link> : <Link href="/dashboard/diarios"><UserPlus size={18}/><span><strong>Diário</strong><small>Aulas e chamada</small></span></Link>}
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
        {riskCount !== null ? (
          <div className="kpi">
            <span className="muted">Alunos em alerta</span>
            <div className="value">{riskCount}</div>
          </div>
        ) : null}
      </div>

      <div className="content-grid">
        <section className="table-card">
          <div className="page-head" style={{ marginBottom: 8 }}>
            <div>
              <strong>Próximas atividades</strong>
              <div className="muted">
                {lessons} aulas registradas
              </div>
            </div>
          </div>

          {assignments.length === 0 ? (
            <p className="muted">Nenhuma atividade futura cadastrada.</p>
          ) : (
            assignments.map((assignment) => (
              <div className="table-row" key={assignment.id}>
                <strong>{assignment.title}</strong>
                <span>
                  {assignment.classGroup.name} · {assignment.subject.name}
                </span>
                <span>
                  {assignment.dueAt?.toLocaleDateString("pt-BR") ??
                    "Sem prazo"}
                </span>
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
          <Link href="/dashboard/comunicados" className="muted">
            Ver todos
          </Link>
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

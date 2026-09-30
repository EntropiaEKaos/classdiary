import {
  completeGuardianMeetingAction,
  createGuardianMeetingAction,
  createStudentFollowUpPlanAction,
  reviewStudentFollowUpPlanAction,
  runCoordinationAlertsAction,
} from "@/app/actions/coordination";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function averageGrade(
  rows: { value: unknown; maxValue: unknown; weight: unknown }[],
) {
  const total = rows.reduce((sum, row) => sum + Number(row.weight), 0);
  if (!total) return 0;
  return (
    rows.reduce(
      (sum, row) =>
        sum +
        ((Number(row.value) / Number(row.maxValue)) * 10) *
          Number(row.weight),
      0,
    ) / total
  );
}

function attendancePercent(rows: { status: string }[]) {
  if (!rows.length) return 100;
  const attended = rows.filter((row) =>
    ["PRESENT", "LATE", "EXCUSED"].includes(row.status),
  ).length;
  return (attended / rows.length) * 100;
}

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  const [
    students,
    classes,
    upcomingMeetings,
    overduePlans,
    activePlans,
    activeInterventions,
    classSubjects,
  ] = await Promise.all([
    db.student.findMany({
      where: {
        organizationId: org.id,
        active: true,
        ...(year
          ? {
              enrollments: {
                some: {
                  active: true,
                  classGroup: { schoolYearId: year.id },
                },
              },
            }
          : {}),
      },
      include: {
        enrollments: {
          where: {
            active: true,
            ...(year
              ? { classGroup: { schoolYearId: year.id } }
              : {}),
          },
          include: { classGroup: true },
        },
        grades: year
          ? {
              where: {
                OR: [
                  { schoolYearId: year.id },
                  {
                    schoolYearId: null,
                    createdAt: {
                      gte: year.startsAt,
                      lte: year.endsAt,
                    },
                  },
                ],
              },
            }
          : false,
        attendance: year
          ? {
              where: {
                lesson: {
                  classGroup: {
                    organizationId: org.id,
                    schoolYearId: year.id,
                  },
                },
              },
            }
          : false,
      },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.classGroup.findMany({
      where: {
        organizationId: org.id,
        ...(year ? { schoolYearId: year.id } : {}),
      },
      orderBy: { name: "asc" },
    }),
    db.guardianMeeting.findMany({
      where: {
        organizationId: org.id,
        status: "SCHEDULED",
        scheduledAt: { gte: now, lte: weekAhead },
      },
      include: { student: true, createdBy: true },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    }),
    db.studentFollowUpPlan.findMany({
      where: {
        organizationId: org.id,
        status: "ACTIVE",
        nextReviewAt: { lte: now },
      },
      include: { student: true, classGroup: true, createdBy: true },
      orderBy: { nextReviewAt: "asc" },
      take: 100,
    }),
    db.studentFollowUpPlan.findMany({
      where: {
        organizationId: org.id,
        status: "ACTIVE",
      },
      include: { student: true, classGroup: true, createdBy: true },
      orderBy: { nextReviewAt: "asc" },
      take: 200,
    }),
    db.pedagogicalIntervention.count({
      where: { organizationId: org.id, status: "ACTIVE" },
    }),
    db.classSubject.findMany({
      where: {
        classGroup: {
          organizationId: org.id,
          ...(year ? { schoolYearId: year.id } : {}),
        },
      },
      include: {
        classGroup: true,
        subject: true,
        teacher: true,
      },
    }),
  ]);

  const riskStudents = students
    .map((student) => {
      const grades = Array.isArray(student.grades) ? student.grades : [];
      const attendance = Array.isArray(student.attendance)
        ? student.attendance
        : [];
      const avg = averageGrade(grades);
      const freq = attendancePercent(attendance);
      const risk =
        (grades.length > 0 && avg < Number(org.passingGrade)) ||
        freq < org.attendanceWarningPercent;
      return { student, avg, freq, risk };
    })
    .filter((row) => row.risk);

  const teacherStats = new Map<
    string,
    { name: string; links: number; classes: Set<string> }
  >();

  for (const link of classSubjects) {
    if (!link.teacherId || !link.teacher) continue;
    const current = teacherStats.get(link.teacherId) ?? {
      name: link.teacher.name,
      links: 0,
      classes: new Set<string>(),
    };
    current.links += 1;
    current.classes.add(link.classGroupId);
    teacherStats.set(link.teacherId, current);
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Central da coordenação</h1>
          <div className="muted">
            {year
              ? `Ano letivo ${year.name} · acompanhamento pedagógico e familiar`
              : "Acompanhamento pedagógico e familiar"}
          </div>
        </div>

        <form action={runCoordinationAlertsAction}>
          <button className="btn btn-light">
            Atualizar alertas da coordenação
          </button>
        </form>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Alunos em risco</span>
          <div className="value">{riskStudents.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Planos vencidos</span>
          <div className="value">{overduePlans.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Atendimentos em 7 dias</span>
          <div className="value">{upcomingMeetings.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Intervenções ativas</span>
          <div className="value">{activeInterventions}</div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Agendar atendimento com responsável</h3>
          <form action={createGuardianMeetingAction} className="form-grid">
            <select name="studentId" required defaultValue="">
              <option value="" disabled>
                Selecione o aluno
              </option>
              {students.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <input
              name="scheduledAt"
              type="datetime-local"
              required
            />
            <input
              name="durationMinutes"
              type="number"
              min="15"
              max="180"
              defaultValue="30"
            />
            <select name="channel" defaultValue="IN_PERSON">
              <option value="IN_PERSON">Presencial</option>
              <option value="PHONE">Telefone</option>
              <option value="VIDEO">Vídeo</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
            <input name="guardianName" placeholder="Nome do responsável" />
            <input
              name="agenda"
              required
              placeholder="Pauta do atendimento"
            />
            <button className="btn btn-primary">
              Agendar atendimento
            </button>
          </form>
        </section>

        <section className="table-card">
          <h3>Novo plano de acompanhamento</h3>
          <form
            action={createStudentFollowUpPlanAction}
            className="form-grid"
          >
            <select name="studentId" required defaultValue="">
              <option value="" disabled>
                Selecione o aluno
              </option>
              {students.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select name="classGroupId" defaultValue="">
              <option value="">Sem turma específica</option>
              {classes.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <input name="title" required placeholder="Título do plano" />
            <input name="objective" required placeholder="Objetivo" />
            <input
              name="actions"
              required
              placeholder="Ações combinadas"
            />
            <input
              name="reviewFrequencyDays"
              type="number"
              min="1"
              max="90"
              defaultValue="7"
            />
            <button className="btn btn-primary">
              Criar acompanhamento
            </button>
          </form>
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Próximos atendimentos</h3>
        {upcomingMeetings.length === 0 ? (
          <p className="muted">Nenhum atendimento agendado para os próximos 7 dias.</p>
        ) : (
          upcomingMeetings.map((meeting) => (
            <div key={meeting.id} className="notice">
              <strong>
                {meeting.student.name} ·{" "}
                {meeting.scheduledAt.toLocaleString("pt-BR")}
              </strong>
              <div className="muted">
                {meeting.channel} · {meeting.guardianName ?? "Responsável"}
                {" · "}
                {meeting.agenda}
              </div>
              <form
                action={completeGuardianMeetingAction}
                className="form-grid compact"
                style={{ marginTop: 8 }}
              >
                <input type="hidden" name="id" value={meeting.id} />
                <input
                  name="outcome"
                  required
                  placeholder="Resultado e encaminhamentos"
                />
                <button className="btn btn-light">
                  Concluir atendimento
                </button>
              </form>
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Planos de acompanhamento</h3>
        {activePlans.length === 0 ? (
          <p className="muted">Nenhum plano ativo.</p>
        ) : (
          activePlans.map((plan) => (
            <div className="table-row" key={plan.id}>
              <div>
                <strong>{plan.student.name} · {plan.title}</strong>
                <div className="muted">
                  {plan.classGroup?.name ?? "Sem turma"} · próxima revisão{" "}
                  {plan.nextReviewAt.toLocaleDateString("pt-BR")}
                </div>
              </div>
              <span className="status">
                {plan.nextReviewAt <= now ? "VENCIDO" : "ATIVO"}
              </span>
              <form action={reviewStudentFollowUpPlanAction}>
                <input type="hidden" name="id" value={plan.id} />
                <button className="btn btn-light">
                  Registrar revisão
                </button>
              </form>
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Indicadores por professor</h3>
        {[...teacherStats.entries()].map(([teacherId, row]) => (
          <div className="table-row" key={teacherId}>
            <strong>{row.name}</strong>
            <span>{row.classes.size} turma(s)</span>
            <span>{row.links} disciplina(s)</span>
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Alunos em risco</h3>
        {riskStudents.slice(0, 50).map((row) => (
          <div className="table-row" key={row.student.id}>
            <strong>{row.student.name}</strong>
            <span>Média {row.avg.toFixed(2)}</span>
            <span>Frequência {row.freq.toFixed(1)}%</span>
          </div>
        ))}
      </section>
    </main>
  );
}

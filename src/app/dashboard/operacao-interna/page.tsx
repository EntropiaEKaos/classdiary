import {
  completeOperationalTaskAction,
  createApprovalRequestAction,
  createOperationalTaskAction,
  decideApprovalRequestAction,
  runOperationalEscalationAction,
} from "@/app/actions/internal-operations";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);

  const [
    members,
    tasks,
    approvals,
    events,
    guardianMeetings,
    maintenance,
  ] = await Promise.all([
    db.membership.findMany({
      where: {
        organizationId: org.id,
        role: {
          in: [
            "SCHOOL_ADMIN",
            "COORDINATOR",
            "SECRETARY",
            "TEACHER",
          ],
        },
      },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.operationalTask.findMany({
      where: {
        organizationId: org.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      include: {
        assignedTo: true,
        createdBy: true,
      },
      orderBy: [
        { escalationLevel: "desc" },
        { dueAt: "asc" },
        { createdAt: "desc" },
      ],
      take: 200,
    }),
    db.approvalRequest.findMany({
      where: {
        organizationId: org.id,
        status: "PENDING",
      },
      include: { createdBy: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.academicEvent.findMany({
      where: {
        organizationId: org.id,
        startsAt: { gte: now, lte: weekAhead },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
    db.guardianMeeting.findMany({
      where: {
        organizationId: org.id,
        status: "SCHEDULED",
        scheduledAt: { gte: now, lte: weekAhead },
      },
      include: { student: true },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    }),
    db.maintenanceTicket.findMany({
      where: {
        organizationId: org.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);

  const overdue = tasks.filter(
    (task) => task.dueAt && task.dueAt < now,
  );
  const critical = tasks.filter(
    (task) => task.priority === "CRITICAL",
  );
  const unassigned = tasks.filter((task) => !task.assignedToId);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Central operacional</h1>
          <div className="muted">
            Tarefas, SLA, aprovações e agenda institucional.
          </div>
        </div>

        <form action={runOperationalEscalationAction}>
          <button className="btn btn-light">
            Processar escalonamentos
          </button>
        </form>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Tarefas abertas</span>
          <div className="value">{tasks.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">SLA vencido</span>
          <div className="value">{overdue.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Críticas</span>
          <div className="value">{critical.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Aprovações pendentes</span>
          <div className="value">{approvals.length}</div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Nova tarefa</h3>
          <form action={createOperationalTaskAction} className="form-grid">
            <input name="title" required placeholder="Título da tarefa" />
            <input name="description" placeholder="Descrição" />
            <select name="assignedToId" defaultValue="">
              <option value="">Sem responsável definido</option>
              {members.map((membership) => (
                <option key={membership.id} value={membership.userId}>
                  {membership.user.name}
                </option>
              ))}
            </select>
            <select name="category" defaultValue="GENERAL">
              <option value="GENERAL">Geral</option>
              <option value="ACADEMIC">Acadêmico</option>
              <option value="FINANCE">Financeiro</option>
              <option value="MAINTENANCE">Manutenção</option>
              <option value="SECRETARY">Secretaria</option>
              <option value="HR">RH</option>
              <option value="FAMILY">Família</option>
            </select>
            <select name="priority" defaultValue="MEDIUM">
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
            <input name="dueAt" type="datetime-local" />
            <input
              name="slaHours"
              type="number"
              min="1"
              max="720"
              placeholder="SLA em horas"
            />
            <button className="btn btn-primary">
              Criar tarefa
            </button>
          </form>
        </section>

        <section className="table-card">
          <h3>Solicitar aprovação</h3>
          <form action={createApprovalRequestAction} className="form-grid">
            <select name="type" defaultValue="OTHER">
              <option value="PURCHASE">Compra</option>
              <option value="DISCOUNT">Desconto</option>
              <option value="DOCUMENT">Documento</option>
              <option value="MAINTENANCE">Manutenção</option>
              <option value="HR">RH</option>
              <option value="OTHER">Outro</option>
            </select>
            <input name="title" required placeholder="Título da solicitação" />
            <input name="description" placeholder="Justificativa" />
            <input name="entityType" placeholder="Tipo relacionado (opcional)" />
            <input name="entityId" placeholder="ID relacionado (opcional)" />
            <button className="btn btn-primary">
              Enviar para aprovação
            </button>
          </form>
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Quadro de tarefas e SLA</h3>

        {unassigned.length ? (
          <div className="notice">
            <strong>
              {unassigned.length} tarefa(s) ainda sem responsável definido.
            </strong>
          </div>
        ) : null}

        {tasks.length === 0 ? (
          <p className="muted">Nenhuma tarefa aberta.</p>
        ) : (
          tasks.map((task) => {
            const isOverdue = Boolean(task.dueAt && task.dueAt < now);

            return (
              <div className="table-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <div className="muted">
                    {task.category} · {task.assignedTo?.name ?? "Sem responsável"}
                    {task.dueAt
                      ? " · prazo " +
                        task.dueAt.toLocaleString("pt-BR")
                      : ""}
                  </div>
                </div>

                <span className="status">
                  {isOverdue
                    ? "SLA VENCIDO"
                    : task.priority}
                  {task.escalationLevel
                    ? " · N" + task.escalationLevel
                    : ""}
                </span>

                <form action={completeOperationalTaskAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <button className="btn btn-light">
                    Concluir
                  </button>
                </form>
              </div>
            );
          })
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Aprovações pendentes</h3>
        {approvals.length === 0 ? (
          <p className="muted">Nenhuma aprovação pendente.</p>
        ) : (
          approvals.map((request) => (
            <div className="notice" key={request.id}>
              <strong>{request.title}</strong>
              <div className="muted">
                {request.type} · solicitado por {request.createdBy.name}
              </div>
              {request.description ? <p>{request.description}</p> : null}

              <form
                action={decideApprovalRequestAction}
                className="form-grid compact"
              >
                <input type="hidden" name="id" value={request.id} />
                <input
                  name="decisionNote"
                  placeholder="Observação da decisão"
                />
                <button
                  className="btn btn-primary"
                  name="decision"
                  value="APPROVED"
                >
                  Aprovar
                </button>
                <button
                  className="btn btn-light"
                  name="decision"
                  value="REJECTED"
                >
                  Rejeitar
                </button>
              </form>
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Agenda institucional · próximos 7 dias</h3>

        {events.map((event) => (
          <div className="table-row" key={"event-" + event.id}>
            <strong>{event.title}</strong>
            <span>Evento institucional</span>
            <span>{event.startsAt.toLocaleString("pt-BR")}</span>
          </div>
        ))}

        {guardianMeetings.map((meeting) => (
          <div className="table-row" key={"meeting-" + meeting.id}>
            <strong>{meeting.student.name}</strong>
            <span>Atendimento com responsável</span>
            <span>{meeting.scheduledAt.toLocaleString("pt-BR")}</span>
          </div>
        ))}

        {maintenance.map((ticket) => (
          <div className="table-row" key={"maintenance-" + ticket.id}>
            <strong>{ticket.title}</strong>
            <span>Manutenção · {ticket.priority}</span>
            <span>{ticket.status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

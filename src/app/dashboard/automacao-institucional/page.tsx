import { createAutomationRuleAction } from "@/app/actions/operations-next";
import {
  createOperationalRoutineAction,
  runDueOperationalRoutinesAction,
  runInstitutionalRulesAction,
} from "@/app/actions/institutional-automation";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400000);

  const [members, routines, rules, tasks, executions] = await Promise.all([
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
    db.operationalRoutine.findMany({
      where: { organizationId: org.id },
      include: { assignedTo: true },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
      take: 200,
    }),
    db.automationRule.findMany({
      where: { organizationId: org.id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.operationalTask.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: since },
      },
      select: {
        id: true,
        category: true,
        status: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        escalationLevel: true,
      },
      take: 1000,
    }),
    db.automationExecution.findMany({
      where: { organizationId: org.id },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
  ]);

  const categories = [
    "GENERAL",
    "ACADEMIC",
    "FINANCE",
    "MAINTENANCE",
    "SECRETARY",
    "HR",
    "FAMILY",
  ];

  const slaRows = categories.map((category) => {
    const rows = tasks.filter((task) => task.category === category);
    const completed = rows.filter((task) => task.status === "DONE");
    const onTime = completed.filter(
      (task) =>
        !task.dueAt ||
        (task.completedAt && task.completedAt <= task.dueAt),
    );
    const overdueOpen = rows.filter(
      (task) =>
        task.status !== "DONE" &&
        task.dueAt &&
        task.dueAt < now,
    );
    const compliance = completed.length
      ? (onTime.length / completed.length) * 100
      : 100;

    return {
      category,
      total: rows.length,
      completed: completed.length,
      overdueOpen: overdueOpen.length,
      compliance,
    };
  }).filter((row) => row.total > 0);

  const dueRoutines = routines.filter(
    (routine) => routine.active && routine.nextRunAt <= now,
  ).length;

  const activeRules = rules.filter((rule) => rule.active).length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Automação institucional</h1>
          <div className="muted">
            Rotinas recorrentes, regras condicionais e SLA operacional.
          </div>
        </div>

        <div className="top-actions">
          <form action={runDueOperationalRoutinesAction}>
            <button className="btn btn-light">
              Executar rotinas vencidas
            </button>
          </form>
          <form action={runInstitutionalRulesAction}>
            <button className="btn btn-primary">
              Processar regras
            </button>
          </form>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Rotinas ativas</span>
          <div className="value">
            {routines.filter((routine) => routine.active).length}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Rotinas vencidas</span>
          <div className="value">{dueRoutines}</div>
        </div>
        <div className="kpi">
          <span className="muted">Regras ativas</span>
          <div className="value">{activeRules}</div>
        </div>
        <div className="kpi">
          <span className="muted">Execuções registradas</span>
          <div className="value">{executions.length}</div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Nova rotina recorrente</h3>
          <form action={createOperationalRoutineAction} className="form-grid">
            <input name="name" required placeholder="Nome da rotina" />
            <input
              name="description"
              placeholder="Descrição da rotina"
            />
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
            <select name="cadence" defaultValue="DAILY">
              <option value="DAILY">Diária</option>
              <option value="WEEKLY">Semanal</option>
              <option value="MONTHLY">Mensal</option>
            </select>
            <input
              name="weekday"
              type="number"
              min="0"
              max="6"
              placeholder="Dia semana 0-6 (opcional)"
            />
            <input
              name="dayOfMonth"
              type="number"
              min="1"
              max="28"
              placeholder="Dia do mês (opcional)"
            />
            <input name="startAt" type="datetime-local" required />
            <input
              name="slaHours"
              type="number"
              min="1"
              max="720"
              placeholder="SLA da tarefa em horas"
            />
            <button className="btn btn-primary">
              Criar rotina
            </button>
          </form>
        </section>

        <section className="table-card">
          <h3>Nova regra condicional</h3>
          <form action={createAutomationRuleAction} className="form-grid">
            <input name="name" required placeholder="Nome da regra" />
            <select name="event" defaultValue="TASK_OVERDUE">
              <option value="TASK_OVERDUE">Tarefa com SLA vencido</option>
              <option value="LOW_STOCK">Estoque baixo</option>
              <option value="APPROVAL_PENDING">Aprovação pendente</option>
              <option value="MAINTENANCE_DUE">Manutenção próxima</option>
              <option value="AUTHORIZATION_PENDING">Autorização pendente</option>
            </select>
            <select name="action" defaultValue="CREATE_NOTIFICATION">
              <option value="CREATE_NOTIFICATION">
                Criar notificação
              </option>
              <option value="CREATE_TASK">
                Criar tarefa
              </option>
            </select>
            <textarea
              name="configuration"
              rows={5}
              placeholder='JSON opcional para CREATE_TASK: {"category":"MAINTENANCE","priority":"HIGH","slaHours":24}'
            />
            <button className="btn btn-primary">
              Criar regra
            </button>
          </form>
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>SLA por setor · últimos 30 dias</h3>
        {slaRows.length === 0 ? (
          <p className="muted">Ainda não há tarefas no período.</p>
        ) : (
          slaRows.map((row) => (
            <div className="table-row" key={row.category}>
              <strong>{row.category}</strong>
              <span>
                {row.completed}/{row.total} concluídas ·{" "}
                {row.overdueOpen} vencida(s) aberta(s)
              </span>
              <span className="status">
                SLA {row.compliance.toFixed(0)}%
              </span>
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Rotinas configuradas</h3>
        {routines.map((routine) => (
          <div className="table-row" key={routine.id}>
            <div>
              <strong>{routine.name}</strong>
              <div className="muted">
                {routine.category} · {routine.cadence} ·{" "}
                {routine.assignedTo?.name ?? "Sem responsável"}
              </div>
            </div>
            <span>
              Próxima execução{" "}
              {routine.nextRunAt.toLocaleString("pt-BR")}
            </span>
            <span className="status">
              {routine.active ? "ATIVA" : "INATIVA"}
            </span>
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Regras condicionais</h3>
        {rules.map((rule) => (
          <div className="table-row" key={rule.id}>
            <strong>{rule.name}</strong>
            <span>
              {rule.event} → {rule.action}
            </span>
            <span className="status">
              {rule.active ? "ATIVA" : "INATIVA"}
            </span>
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Histórico de automações</h3>
        {executions.length === 0 ? (
          <p className="muted">Nenhuma execução registrada.</p>
        ) : (
          executions.map((execution) => (
            <div className="table-row" key={execution.id}>
              <strong>{execution.sourceType}</strong>
              <span>
                {execution.startedAt.toLocaleString("pt-BR")} ·{" "}
                {execution.matchedCount} ocorrência(s) ·{" "}
                {execution.createdCount} ação(ões)
              </span>
              <span className="status">{execution.status}</span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

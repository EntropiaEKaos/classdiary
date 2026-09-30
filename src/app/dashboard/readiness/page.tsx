import {
  createIncidentAction,
  recordBackupVerificationAction,
  recordRestoreDrillAction,
  resolveIncidentAction,
  upsertReleaseChecklistItemAction,
  initializeReleaseChecklistAction,
} from "@/app/actions/readiness";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { getReleaseReadinessSnapshot } from "@/lib/release-readiness";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const [
    incidents,
    backups,
    drills,
    checklist,
    automationExecutions,
    automaticReadiness,
  ] = await Promise.all([
    db.incident.findMany({
      where: { organizationId: org.id },
      include: { createdBy: true, resolvedBy: true },
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
      take: 100,
    }),
    db.backupVerification.findMany({
      where: { organizationId: org.id },
      include: { createdBy: true },
      orderBy: { checkedAt: "desc" },
      take: 50,
    }),
    db.restoreDrill.findMany({
      where: { organizationId: org.id },
      include: { createdBy: true },
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
    db.releaseChecklistItem.findMany({
      where: { organizationId: org.id },
      include: { updatedBy: true },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    db.automationExecution.findMany({
      where: { organizationId: org.id },
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
    getReleaseReadinessSnapshot(org.id),
  ]);

  const openIncidents = incidents.filter((item) => item.status === "OPEN");
  const criticalIncidents = openIncidents.filter(
    (item) => item.severity === "CRITICAL",
  );
  const required = checklist.filter((item) => item.required);
  const requiredDone = required.filter((item) => item.status === "DONE");
  const readinessPercent = required.length
    ? (requiredDone.length / required.length) * 100
    : 0;

  const lastBackup = backups[0];
  const lastSuccessfulDrill = drills.find(
    (drill) => drill.status === "SUCCESS" && drill.dataVerified,
  );
  const failedExecutions = automationExecutions.filter(
    (execution) => execution.status !== "SUCCESS",
  );

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Readiness operacional</h1>
          <div className="muted">
            Incidentes, backup, restore drill, automações e checklist de lançamento.
          </div>
        </div>
        <div className="top-actions">
          <a className="btn btn-light" href="/api/health/live">
            Liveness
          </a>
          <a className="btn btn-light" href="/api/health/ready">
            Readiness
          </a>
        </div>
      </div>

      <section className="table-card" style={{ marginBottom: 16 }}>
        <div className="page-head">
          <div>
            <h3>Gate automático de publicação</h3>
            <div className="muted">
              Critérios internos de release; não substituem análise jurídica ou operacional externa.
            </div>
          </div>
          <span className="status">
            {automaticReadiness.ready ? "PRONTO" : "BLOQUEADO"}
          </span>
        </div>

        {automaticReadiness.checks.map((check) => (
          <div className="table-row" key={check.code}>
            <strong>{check.code}</strong>
            <span>{check.detail}</span>
            <span className="status">{check.ok ? "OK" : "PENDENTE"}</span>
          </div>
        ))}

        <form action={initializeReleaseChecklistAction} style={{ marginTop: 12 }}>
          <button className="btn btn-light">
            Criar/atualizar checklist padrão
          </button>
        </form>
      </section>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Readiness obrigatório</span>
          <div className="value">{readinessPercent.toFixed(0)}%</div>
        </div>
        <div className="kpi">
          <span className="muted">Incidentes abertos</span>
          <div className="value">{openIncidents.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Críticos abertos</span>
          <div className="value">{criticalIncidents.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Jobs com falha</span>
          <div className="value">{failedExecutions.length}</div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Abrir incidente</h3>
          <form action={createIncidentAction} className="form-grid">
            <input name="title" required placeholder="Título" />
            <input name="service" placeholder="Serviço afetado" />
            <select name="severity" defaultValue="MEDIUM">
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
            <textarea
              name="description"
              required
              rows={4}
              placeholder="Descrição e impacto"
            />
            <button className="btn btn-primary">Abrir incidente</button>
          </form>
        </section>

        <section className="table-card">
          <h3>Verificar backup</h3>
          <form
            action={recordBackupVerificationAction}
            className="form-grid"
          >
            <select name="backupType" defaultValue="DATABASE">
              <option value="DATABASE">Banco de dados</option>
              <option value="FILES">Arquivos</option>
              <option value="FULL">Completo</option>
            </select>
            <input name="provider" placeholder="Provedor" />
            <input
              name="reference"
              placeholder="Snapshot/backup ID ou referência"
            />
            <select name="status" defaultValue="VERIFIED">
              <option value="VERIFIED">Verificado</option>
              <option value="PARTIAL">Parcial</option>
              <option value="FAILED">Falhou</option>
            </select>
            <input name="notes" placeholder="Observações" />
            <button className="btn btn-primary">
              Registrar verificação
            </button>
          </form>
        </section>
      </div>

      <div className="content-grid" style={{ marginTop: 16 }}>
        <section className="table-card">
          <h3>Registrar restore drill</h3>
          <form action={recordRestoreDrillAction} className="form-grid">
            <input
              name="environment"
              required
              placeholder="staging / sandbox"
            />
            <select name="status" defaultValue="SUCCESS">
              <option value="SUCCESS">Sucesso</option>
              <option value="PARTIAL">Parcial</option>
              <option value="FAILED">Falhou</option>
            </select>
            <input name="startedAt" type="datetime-local" required />
            <input name="finishedAt" type="datetime-local" />
            <input
              name="rtoMinutes"
              type="number"
              min="0"
              placeholder="RTO em minutos"
            />
            <input
              name="rpoMinutes"
              type="number"
              min="0"
              placeholder="RPO em minutos"
            />
            <select name="dataVerified" defaultValue="true">
              <option value="true">Dados verificados</option>
              <option value="false">Dados não verificados</option>
            </select>
            <input name="notes" placeholder="Observações do teste" />
            <button className="btn btn-primary">
              Registrar restore drill
            </button>
          </form>
        </section>

        <section className="table-card">
          <h3>Checklist de lançamento</h3>
          <form
            action={upsertReleaseChecklistItemAction}
            className="form-grid"
          >
            <input
              name="code"
              required
              placeholder="Ex.: DB_BASELINE"
            />
            <input name="title" required placeholder="Item do checklist" />
            <select name="category" defaultValue="APPLICATION">
              <option value="DATABASE">Banco</option>
              <option value="SECURITY">Segurança</option>
              <option value="OBSERVABILITY">Observabilidade</option>
              <option value="BACKUP">Backup</option>
              <option value="PRIVACY">Privacidade</option>
              <option value="APPLICATION">Aplicação</option>
              <option value="OPERATIONS">Operação</option>
            </select>
            <select name="required" defaultValue="true">
              <option value="true">Obrigatório</option>
              <option value="false">Opcional</option>
            </select>
            <select name="status" defaultValue="PENDING">
              <option value="PENDING">Pendente</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="DONE">Concluído</option>
              <option value="BLOCKED">Bloqueado</option>
            </select>
            <input name="evidence" placeholder="Evidência / referência" />
            <input name="notes" placeholder="Observações" />
            <button className="btn btn-primary">
              Salvar item
            </button>
          </form>
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Status de recuperação</h3>
        <div className="table-row">
          <strong>Último backup</strong>
          <span>
            {lastBackup
              ? lastBackup.checkedAt.toLocaleString("pt-BR")
              : "Nenhum registro"}
          </span>
          <span className="status">
            {lastBackup?.status ?? "PENDENTE"}
          </span>
        </div>
        <div className="table-row">
          <strong>Último restore drill validado</strong>
          <span>
            {lastSuccessfulDrill
              ? lastSuccessfulDrill.startedAt.toLocaleString("pt-BR")
              : "Nenhum teste validado"}
          </span>
          <span className="status">
            {lastSuccessfulDrill
              ? `RTO ${lastSuccessfulDrill.rtoMinutes ?? "?"}m · RPO ${lastSuccessfulDrill.rpoMinutes ?? "?"}m`
              : "PENDENTE"}
          </span>
        </div>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Incidentes</h3>
        {incidents.length === 0 ? (
          <p className="muted">Nenhum incidente registrado.</p>
        ) : (
          incidents.map((incident) => (
            <div className="notice" key={incident.id}>
              <strong>
                {incident.severity} · {incident.title}
              </strong>
              <div className="muted">
                {incident.service ?? "Aplicação"} ·{" "}
                {incident.startedAt.toLocaleString("pt-BR")} ·{" "}
                {incident.status}
              </div>
              <p>{incident.description}</p>

              {incident.status === "OPEN" ? (
                <form
                  action={resolveIncidentAction}
                  className="form-grid compact"
                >
                  <input type="hidden" name="id" value={incident.id} />
                  <input
                    name="resolution"
                    required
                    placeholder="Causa, correção e prevenção"
                  />
                  <button className="btn btn-light">
                    Resolver incidente
                  </button>
                </form>
              ) : (
                <p className="muted">
                  Resolução: {incident.resolution ?? "—"}
                </p>
              )}
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Checklist</h3>
        {checklist.length === 0 ? (
          <p className="muted">
            Nenhum item de readiness cadastrado ainda.
          </p>
        ) : (
          checklist.map((item) => (
            <div className="table-row" key={item.id}>
              <div>
                <strong>
                  {item.code} · {item.title}
                </strong>
                <div className="muted">
                  {item.category} ·{" "}
                  {item.required ? "Obrigatório" : "Opcional"}
                </div>
              </div>
              <span>{item.evidence ?? "Sem evidência"}</span>
              <span className="status">{item.status}</span>
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Últimos jobs críticos</h3>
        {automationExecutions.map((execution) => (
          <div className="table-row" key={execution.id}>
            <strong>{execution.sourceType}</strong>
            <span>
              {execution.startedAt.toLocaleString("pt-BR")} ·{" "}
              {execution.matchedCount} ocorrência(s) ·{" "}
              {execution.createdCount} ação(ões)
            </span>
            <span className="status">{execution.status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

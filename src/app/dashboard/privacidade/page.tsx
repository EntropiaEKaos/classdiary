import {
  updateDataSubjectRequestAction,
  upsertRetentionPolicyAction,
} from "@/app/actions/privacy";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const [requests, policies, accessLogs, consentSummary] = await Promise.all([
    db.dataSubjectRequest.findMany({
      where: { organizationId: org.id },
      include: {
        requester: true,
        student: true,
        decidedBy: true,
      },
      orderBy: [
        { status: "asc" },
        { createdAt: "asc" },
      ],
      take: 200,
    }),
    db.retentionPolicy.findMany({
      where: { organizationId: org.id },
      orderBy: { dataCategory: "asc" },
    }),
    db.sensitiveAccessLog.findMany({
      where: { organizationId: org.id },
      include: {
        user: true,
        student: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.privacyConsent.groupBy({
      by: ["type", "status"],
      where: { organizationId: org.id },
      _count: { _all: true },
    }),
  ]);

  const openRequests = requests.filter((request) =>
    ["OPEN", "IN_REVIEW"].includes(request.status),
  );

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Privacidade e governança de dados</h1>
          <div className="muted">
            Consentimentos, solicitações, retenção e acessos sensíveis.
          </div>
        </div>

        <a className="btn btn-light" href="/privacidade">
          Abrir portal do titular
        </a>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Solicitações abertas</span>
          <div className="value">{openRequests.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Políticas de retenção</span>
          <div className="value">{policies.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Acessos sensíveis recentes</span>
          <div className="value">{accessLogs.length}</div>
        </div>
        <div className="kpi">
          <span className="muted">Tipos de consentimento</span>
          <div className="value">
            {new Set(consentSummary.map((row) => row.type)).size}
          </div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Política de retenção</h3>
          <form action={upsertRetentionPolicyAction} className="form-grid">
            <select name="dataCategory" defaultValue="ACADEMIC">
              <option value="ACADEMIC">Acadêmico</option>
              <option value="FINANCIAL">Financeiro</option>
              <option value="HEALTH">Saúde</option>
              <option value="COMMUNICATION">Comunicação</option>
              <option value="AUDIT">Auditoria</option>
              <option value="FILES">Arquivos</option>
            </select>

            <input
              name="retentionDays"
              type="number"
              min="30"
              max="36500"
              defaultValue="1825"
              required
            />

            <select name="action" defaultValue="REVIEW">
              <option value="REVIEW">Revisar ao final</option>
              <option value="ARCHIVE">Arquivar</option>
              <option value="ANONYMIZE">Revisar para anonimização</option>
            </select>

            <input name="notes" placeholder="Critério/justificativa interna" />

            <button className="btn btn-primary">
              Salvar política
            </button>
          </form>
        </section>

        <section className="table-card">
          <h3>Resumo de consentimentos</h3>
          {consentSummary.length === 0 ? (
            <p className="muted">Nenhum consentimento registrado.</p>
          ) : (
            consentSummary.map((row) => (
              <div
                className="table-row"
                key={row.type + "-" + row.status}
              >
                <strong>{row.type}</strong>
                <span>{row.status}</span>
                <span>{row._count._all}</span>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Solicitações de titulares</h3>

        {requests.length === 0 ? (
          <p className="muted">Nenhuma solicitação recebida.</p>
        ) : (
          requests.map((request) => (
            <div className="notice" key={request.id}>
              <strong>
                {request.type} · {request.student?.name ?? request.requester.name}
              </strong>
              <div className="muted">
                {request.createdAt.toLocaleString("pt-BR")} · {request.status}
              </div>
              <p>{request.description}</p>

              {request.student ? (
                <a
                  className="btn btn-light"
                  href={`/api/privacidade/exportar/${request.student.id}`}
                >
                  Exportar dados autorizados
                </a>
              ) : null}

              {["OPEN", "IN_REVIEW"].includes(request.status) ? (
                <form
                  action={updateDataSubjectRequestAction}
                  className="form-grid"
                  style={{ marginTop: 10 }}
                >
                  <input type="hidden" name="id" value={request.id} />
                  <textarea
                    name="resolution"
                    required
                    rows={3}
                    placeholder="Resposta, providência ou motivo da decisão"
                  />
                  <select name="status" defaultValue="IN_REVIEW">
                    <option value="IN_REVIEW">Em análise</option>
                    <option value="COMPLETED">Concluída</option>
                    <option value="REJECTED">Rejeitada</option>
                  </select>
                  <button className="btn btn-primary">
                    Atualizar solicitação
                  </button>
                </form>
              ) : (
                <p className="muted">
                  Decisão: {request.resolution ?? "Sem observação"}
                </p>
              )}
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Políticas cadastradas</h3>
        {policies.map((policy) => (
          <div className="table-row" key={policy.id}>
            <strong>{policy.dataCategory}</strong>
            <span>{policy.retentionDays} dias</span>
            <span className="status">{policy.action}</span>
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Acessos sensíveis recentes</h3>
        {accessLogs.length === 0 ? (
          <p className="muted">Nenhum acesso sensível registrado.</p>
        ) : (
          accessLogs.map((log) => (
            <div className="table-row" key={log.id}>
              <div>
                <strong>{log.user.name}</strong>
                <div className="muted">
                  {log.student?.name ?? "Sem aluno"} · {log.purpose ?? "Sem finalidade informada"}
                </div>
              </div>
              <span>
                {log.resourceType}
                {log.resourceId ? " · " + log.resourceId : ""}
              </span>
              <span>{log.createdAt.toLocaleString("pt-BR")}</span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

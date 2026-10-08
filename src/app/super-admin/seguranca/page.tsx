import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SecurityAdminPage() {
  const now = new Date();
  const [activeSessions, blockedAttempts, incidents, privacyRequests, backupChecks, logs] = await Promise.all([
    db.session.count({ where: { expiresAt: { gt: now } } }),
    db.loginThrottle.count({ where: { blockedUntil: { gt: now } } }),
    db.incident.count(),
    db.dataSubjectRequest.count(),
    db.backupVerification.count(),
    db.auditLog.findMany({
      take: 80,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        organization: { select: { name: true } },
      },
    }),
  ]);

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div><span className="badge">Governança</span><h1>Segurança & auditoria</h1><p className="muted">Sessões, bloqueios, LGPD, incidentes e trilha de ações críticas.</p></div>
      </div>
      <div className="dashboard-grid">
        <div className="kpi"><span className="muted">Sessões ativas</span><div className="value">{activeSessions}</div></div>
        <div className="kpi"><span className="muted">Bloqueios de login</span><div className="value">{blockedAttempts}</div></div>
        <div className="kpi"><span className="muted">Solicitações LGPD</span><div className="value">{privacyRequests}</div></div>
        <div className="kpi"><span className="muted">Incidentes</span><div className="value">{incidents}</div></div>
      </div>
      <section className="admin-section">
        <h2>Backup & continuidade</h2>
        <p className="muted">{backupChecks} verificações de backup registradas no sistema.</p>
      </section>
      <section className="admin-section">
        <h2>Auditoria recente</h2>
        <table className="admin-table">
          <thead><tr><th>Quando</th><th>Ação</th><th>Entidade</th><th>Usuário</th><th>Escola</th></tr></thead>
          <tbody>{logs.map((log) => (
            <tr key={log.id}>
              <td>{log.createdAt.toLocaleString("pt-BR")}</td>
              <td><strong>{log.action}</strong></td>
              <td>{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 10)}` : ""}</td>
              <td>{log.user?.email ?? "Sistema"}</td>
              <td>{log.organization?.name ?? "Plataforma"}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}

import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/page-header";

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
      <AdminPageHeader
        eyebrow="Governança"
        title="Segurança & auditoria"
        description="Sessões, bloqueios, LGPD, incidentes e trilha de ações críticas."
      />

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card"><span>Sessões ativas</span><strong>{activeSessions}</strong><small>acessos válidos</small></article>
        <article className="admin-kpi-card"><span>Bloqueios de login</span><strong>{blockedAttempts}</strong><small>proteções em vigor</small></article>
        <article className="admin-kpi-card"><span>Solicitações LGPD</span><strong>{privacyRequests}</strong><small>requisições registradas</small></article>
        <article className="admin-kpi-card"><span>Incidentes</span><strong>{incidents}</strong><small>eventos operacionais</small></article>
      </div>

      <section className="admin-section admin-summary-strip">
        <div><span className="admin-eyebrow">Backup & continuidade</span><h2>{backupChecks} verificações registradas</h2></div>
        <p>Use a trilha abaixo para acompanhar ações sensíveis executadas na plataforma.</p>
      </section>

      <section className="admin-section admin-table-section">
        <div className="admin-section-head"><div><h2>Auditoria recente</h2><p>Últimos 80 eventos registrados.</p></div></div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-responsive-table">
            <thead><tr><th>Quando</th><th>Ação</th><th>Entidade</th><th>Usuário</th><th>Escola</th></tr></thead>
            <tbody>{logs.map((log) => (
              <tr key={log.id}>
                <td data-label="Quando">{log.createdAt.toLocaleString("pt-BR")}</td>
                <td data-label="Ação"><strong>{log.action}</strong></td>
                <td data-label="Entidade">{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 10)}` : ""}</td>
                <td data-label="Usuário" className="admin-break-text">{log.user?.email ?? "Sistema"}</td>
                <td data-label="Escola">{log.organization?.name ?? "Plataforma"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

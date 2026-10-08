import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HealthAdminPage() {
  const startedAt = Date.now();
  let databaseOk = true;
  let migrations: Array<{ migration_name: string; finished_at: Date | null }> = [];

  try {
    await db.$queryRaw`SELECT 1`;
    migrations = await db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>
      `SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY finished_at DESC NULLS LAST`;
  } catch {
    databaseOk = false;
  }

  const [schools, users, sessions] = await Promise.all([
    db.organization.count({ where: { active: true, slug: { not: "classdiary-platform" } } }),
    db.user.count({ where: { active: true } }),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div><span className="badge">Operações</span><h1>Saúde da plataforma</h1><p className="muted">Diagnóstico direto do runtime e do PostgreSQL.</p></div>
        <span className={databaseOk ? "admin-status ok" : "admin-status danger"}>Banco {databaseOk ? "online" : "indisponível"}</span>
      </div>
      <div className="dashboard-grid">
        <div className="kpi"><span className="muted">Latência da checagem</span><div className="value">{Date.now() - startedAt}ms</div></div>
        <div className="kpi"><span className="muted">Escolas ativas</span><div className="value">{schools}</div></div>
        <div className="kpi"><span className="muted">Usuários ativos</span><div className="value">{users}</div></div>
        <div className="kpi"><span className="muted">Sessões</span><div className="value">{sessions}</div></div>
      </div>
      <section className="admin-section">
        <h2>Migrations aplicadas</h2>
        <table className="admin-table">
          <thead><tr><th>Migration</th><th>Finalizada</th></tr></thead>
          <tbody>{migrations.map((migration) => (
            <tr key={migration.migration_name}><td><strong>{migration.migration_name}</strong></td><td>{migration.finished_at?.toLocaleString("pt-BR") ?? "Pendente"}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}

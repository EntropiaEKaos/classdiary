import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function HealthAdminPage() {
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
    db.session.count(),
  ]);

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="Operações"
        title="Saúde da plataforma"
        description="Diagnóstico direto do runtime e do PostgreSQL."
      >
        <span className={databaseOk ? "admin-status ok" : "admin-status danger"}><span className="admin-status-dot" />Banco {databaseOk ? "online" : "indisponível"}</span>
      </AdminPageHeader>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card"><span>Migrations aplicadas</span><strong>{migrations.length}</strong><small>histórico válido</small></article>
        <article className="admin-kpi-card"><span>Escolas ativas</span><strong>{schools}</strong><small>tenants operacionais</small></article>
        <article className="admin-kpi-card"><span>Usuários ativos</span><strong>{users}</strong><small>contas habilitadas</small></article>
        <article className="admin-kpi-card"><span>Sessões</span><strong>{sessions}</strong><small>registros existentes</small></article>
      </div>

      <section className="admin-section admin-table-section">
        <div className="admin-section-head"><div><h2>Migrations aplicadas</h2><p>Histórico reconhecido pelo Prisma na base atual.</p></div></div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-responsive-table">
            <thead><tr><th>Migration</th><th>Finalizada</th></tr></thead>
            <tbody>{migrations.map((migration) => (
              <tr key={migration.migration_name}>
                <td data-label="Migration" className="admin-break-text"><strong>{migration.migration_name}</strong></td>
                <td data-label="Finalizada">{migration.finished_at?.toLocaleString("pt-BR") ?? "Pendente"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

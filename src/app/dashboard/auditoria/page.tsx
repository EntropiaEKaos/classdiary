import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);
  const logs = await db.auditLog.findMany({
    where: { organizationId: org.id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Auditoria</h1>
          <div className="muted">Últimas ações críticas registradas no ambiente.</div>
        </div>
      </div>
      <section className="table-card">
        {logs.length === 0 ? <p className="muted">Nenhum evento registrado.</p> : logs.map((log) => (
          <div className="table-row" key={log.id}>
            <strong>{log.action} · {log.entity}</strong>
            <span>{log.user?.name ?? "Sistema"}</span>
            <span>{log.createdAt.toLocaleString("pt-BR")}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

import { togglePlatformUserAction } from "@/app/actions/platform-admin";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSubmitButton } from "@/components/admin/submit-button";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const [users, actor] = await Promise.all([
    db.user.findMany({
      take: 150,
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          include: { organization: { select: { name: true, slug: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    currentUser(),
  ]);

  const activeUsers = users.filter((user) => user.active).length;

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="Identidade"
        title="Usuários"
        description="Contas globais, vínculos com escolas e controle de acesso."
      >
        <span className="admin-count-pill">{activeUsers} ativos</span>
      </AdminPageHeader>

      <section className="admin-section admin-table-section">
        <div className="admin-section-head">
          <div><h2>Contas da plataforma</h2><p>Mostrando até 150 usuários recentes.</p></div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-responsive-table">
            <thead><tr><th>Usuário</th><th>Acessos</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td data-label="Usuário"><strong>{user.name}</strong><br/><span className="muted admin-break-text">{user.email}</span></td>
                  <td data-label="Acessos">
                    {user.memberships.length
                      ? user.memberships.map((m) => <div className="admin-access-line" key={m.id}><strong>{m.organization.name}</strong><span>{m.role}</span></div>)
                      : <span className="muted">Sem vínculo</span>}
                  </td>
                  <td data-label="Status"><span className={user.active ? "admin-status ok" : "admin-status danger"}><span className="admin-status-dot" />{user.active ? "Ativo" : "Bloqueado"}</span></td>
                  <td data-label="Ação" className="admin-table-action">
                    {actor?.id === user.id ? <span className="admin-self-chip">Sua conta</span> : (
                      <form action={togglePlatformUserAction}>
                        <input type="hidden" name="userId" value={user.id}/>
                        <AdminSubmitButton pendingLabel={user.active ? "Bloqueando..." : "Reativando..."} variant={user.active ? "danger" : "secondary"}>
                          {user.active ? "Bloquear" : "Reativar"}
                        </AdminSubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

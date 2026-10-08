import { togglePlatformUserAction } from "@/app/actions/platform-admin";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div><span className="badge">Identidade</span><h1>Usuários</h1><p className="muted">Contas globais e vínculos com escolas.</p></div>
      </div>
      <section className="admin-section">
        <table className="admin-table">
          <thead><tr><th>Usuário</th><th>Acessos</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong><br/><span className="muted">{user.email}</span></td>
                <td>{user.memberships.length ? user.memberships.map((m) => <div key={m.id}>{m.role} · {m.organization.name}</div>) : <span className="muted">Sem vínculo</span>}</td>
                <td><span className={user.active ? "admin-status ok" : "admin-status danger"}>{user.active ? "Ativo" : "Bloqueado"}</span></td>
                <td>
                  {actor?.id === user.id ? <span className="muted">Sua conta</span> : (
                    <form action={togglePlatformUserAction}>
                      <input type="hidden" name="userId" value={user.id}/>
                      <button className="btn btn-light">{user.active ? "Bloquear" : "Reativar"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

import { toggleOrganizationAction, updateSubscriptionAction } from "@/app/actions/billing";
import { db } from "@/lib/db";
import { PLAN_CATALOG, normalizePlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SchoolsAdminPage() {
  const organizations = await db.organization.findMany({
    where: { slug: { not: "classdiary-platform" } },
    include: {
      subscription: true,
      memberships: { where: { user: { active: true } }, select: { userId: true } },
      _count: { select: { students: { where: { active: true } }, classGroups: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div><span className="badge">Tenants</span><h1>Escolas</h1><p className="muted">Administre plano, capacidade e acesso de cada instituição.</p></div>
      </div>
      <div className="admin-grid">
        {organizations.map((org) => {
          const plan = normalizePlan(org.subscription?.plan);
          const limits = PLAN_CATALOG[plan];
          const users = new Set(org.memberships.map((m) => m.userId)).size;
          return (
            <article className="tenant-card" key={org.id}>
              <span className={org.active ? "admin-status ok" : "admin-status danger"}>{org.active ? "ATIVA" : "BLOQUEADA"}</span>
              <h3 style={{ marginTop: 12 }}>{org.name}</h3>
              <div className="muted">{org.slug}</div>
              <div className="tenant-meta">
                <span>Plano: <strong>{limits.label}</strong></span>
                <span>Alunos: <strong>{org._count.students}/{limits.maxStudents ?? "∞"}</strong></span>
                <span>Turmas: <strong>{org._count.classGroups}/{limits.maxClasses ?? "∞"}</strong></span>
                <span>Usuários: <strong>{users}/{org.subscription?.seats ?? limits.maxSeats ?? "∞"}</strong></span>
              </div>
              <form action={updateSubscriptionAction} className="form-stack" style={{ marginTop: 16 }}>
                <input type="hidden" name="organizationId" value={org.id} />
                <select name="plan" defaultValue={org.subscription?.plan ?? "STARTER"}>
                  <option value="STARTER">Starter</option><option value="PRO">Pro</option><option value="ENTERPRISE">Enterprise</option>
                </select>
                <select name="status" defaultValue={org.subscription?.status ?? "TRIAL"}>
                  <option value="TRIAL">Trial</option><option value="ACTIVE">Ativa</option><option value="PAST_DUE">Em atraso</option><option value="CANCELED">Cancelada</option>
                </select>
                <input name="seats" type="number" min="1" defaultValue={org.subscription?.seats ?? 20} />
                <button className="btn btn-primary">Salvar plano</button>
              </form>
              <form action={toggleOrganizationAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="organizationId" value={org.id} />
                <button className="btn btn-light">{org.active ? "Bloquear escola" : "Desbloquear escola"}</button>
              </form>
            </article>
          );
        })}
      </div>
    </main>
  );
}

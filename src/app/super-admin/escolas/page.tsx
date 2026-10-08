import { toggleOrganizationAction, updateSubscriptionAction } from "@/app/actions/billing";
import { db } from "@/lib/db";
import { PLAN_CATALOG, normalizePlan } from "@/lib/plans";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSubmitButton } from "@/components/admin/submit-button";

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
      <AdminPageHeader
        eyebrow="Tenants"
        title="Escolas"
        description="Administre plano, capacidade e acesso de cada instituição."
      >
        <span className="admin-count-pill">{organizations.length} escolas</span>
      </AdminPageHeader>

      {organizations.length ? (
        <div className="admin-grid admin-school-grid">
          {organizations.map((org) => {
            const plan = normalizePlan(org.subscription?.plan);
            const limits = PLAN_CATALOG[plan];
            const users = new Set(org.memberships.map((m) => m.userId)).size;
            return (
              <article className="tenant-card admin-school-card" key={org.id}>
                <div className="admin-card-head">
                  <div>
                    <span className={org.active ? "admin-status ok" : "admin-status danger"}>
                      <span className="admin-status-dot" />
                      {org.active ? "Ativa" : "Bloqueada"}
                    </span>
                    <h2>{org.name}</h2>
                    <span className="muted">{org.slug}</span>
                  </div>
                  <span className="admin-plan-badge">{limits.label}</span>
                </div>

                <div className="admin-metric-row">
                  <div><span>Alunos</span><strong>{org._count.students}</strong><small>de {limits.maxStudents ?? "∞"}</small></div>
                  <div><span>Turmas</span><strong>{org._count.classGroups}</strong><small>de {limits.maxClasses ?? "∞"}</small></div>
                  <div><span>Usuários</span><strong>{users}</strong><small>de {org.subscription?.seats ?? limits.maxSeats ?? "∞"}</small></div>
                </div>

                <form action={updateSubscriptionAction} className="admin-school-form">
                  <input type="hidden" name="organizationId" value={org.id} />
                  <label>Plano
                    <select name="plan" defaultValue={org.subscription?.plan ?? "STARTER"}>
                      <option value="STARTER">Starter</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </label>
                  <label>Status
                    <select name="status" defaultValue={org.subscription?.status ?? "TRIAL"}>
                      <option value="TRIAL">Trial</option>
                      <option value="ACTIVE">Ativa</option>
                      <option value="PAST_DUE">Em atraso</option>
                      <option value="CANCELED">Cancelada</option>
                    </select>
                  </label>
                  <label>Usuários contratados
                    <input name="seats" type="number" min="1" defaultValue={org.subscription?.seats ?? 20} />
                  </label>
                  <AdminSubmitButton pendingLabel="Salvando plano...">Salvar plano</AdminSubmitButton>
                </form>

                <form action={toggleOrganizationAction} className="admin-card-secondary-action">
                  <input type="hidden" name="organizationId" value={org.id} />
                  <AdminSubmitButton
                    pendingLabel={org.active ? "Bloqueando..." : "Desbloqueando..."}
                    variant={org.active ? "danger" : "secondary"}
                  >
                    {org.active ? "Bloquear escola" : "Desbloquear escola"}
                  </AdminSubmitButton>
                </form>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="admin-empty-state">
          <Building2Icon />
          <h2>Nenhuma escola cadastrada</h2>
          <p>As instituições aparecerão aqui assim que iniciarem o onboarding.</p>
        </section>
      )}
    </main>
  );
}

function Building2Icon() {
  return <span className="admin-empty-icon" aria-hidden="true">🏫</span>;
}

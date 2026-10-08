import { db } from "@/lib/db";
import { PLAN_CATALOG } from "@/lib/plans";
import { AdminPageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function PlansAdminPage() {
  const subscriptions = await db.subscription.groupBy({
    by: ["plan", "status"],
    _count: { _all: true },
  });

  const count = (plan: string) =>
    subscriptions.filter((item) => item.plan === plan).reduce((sum, item) => sum + item._count._all, 0);

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="Comercial"
        title="Planos & cobrança"
        description="Limites efetivos usados pelo motor de capacidade do EduSync."
      />

      <div className="admin-plan-grid">
        {Object.entries(PLAN_CATALOG).map(([code, plan]) => (
          <article className="admin-plan" key={code}>
            <div className="admin-card-head">
              <div>
                <span className="admin-plan-badge">{code}</span>
                <h2>{plan.label}</h2>
              </div>
              <span className="admin-subscription-count">{count(code)}</span>
            </div>
            <dl>
              <div><dt>Alunos</dt><dd>{plan.maxStudents ?? "Ilimitado"}</dd></div>
              <div><dt>Turmas</dt><dd>{plan.maxClasses ?? "Ilimitado"}</dd></div>
              <div><dt>Usuários</dt><dd>{plan.maxSeats ?? "Ilimitado"}</dd></div>
              <div><dt>Assinaturas</dt><dd>{count(code)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <section className="admin-section admin-integration-callout">
        <div>
          <span className="admin-eyebrow">Provedor de cobrança</span>
          <h2>Mercado Pago</h2>
          <p>Credenciais nunca são exibidas no painel. Somente o estado seguro de configuração é mostrado.</p>
        </div>
        <span className={process.env.MERCADO_PAGO_ACCESS_TOKEN ? "admin-status ok" : "admin-status warn"}>
          <span className="admin-status-dot" />
          {process.env.MERCADO_PAGO_ACCESS_TOKEN ? "Configurado" : "Sem token"}
        </span>
      </section>
    </main>
  );
}

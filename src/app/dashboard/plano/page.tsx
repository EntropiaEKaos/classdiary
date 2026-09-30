import { requireSchoolRole } from "@/lib/rbac";
import { getOrganizationPlanUsage } from "@/lib/plans";
import { subscriptionAccessMessage, subscriptionAccessState } from "@/lib/subscription-lifecycle";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function quota(current: number, limit: number | null) {
  return limit === null ? `${current} / ilimitado` : `${current} / ${limit}`;
}

export default async function PlanPage() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);
  const [snapshot, checkouts] = await Promise.all([
    getOrganizationPlanUsage(org.id),
    db.billingCheckout.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const subscription = snapshot.subscription;
  const lifecycle = subscription
    ? subscriptionAccessState(subscription)
    : "BLOCKED";

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Plano SaaS</span>
          <h1>{snapshot.limits.label}</h1>
          <div className="muted">
            Status {subscription?.status ?? "SEM ASSINATURA"} · {subscriptionAccessMessage(lifecycle)}
            {subscription?.trialEndsAt
              ? ` · Trial até ${subscription.trialEndsAt.toLocaleDateString("pt-BR")}`
              : ""}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Alunos ativos</span>
          <div className="value">
            {quota(snapshot.usage.students, snapshot.limits.maxStudents)}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Turmas</span>
          <div className="value">
            {quota(snapshot.usage.classes, snapshot.limits.maxClasses)}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Usuários</span>
          <div className="value">
            {quota(
              snapshot.usage.seats,
              snapshot.limits.maxSeats === null
                ? null
                : Math.min(subscription?.seats ?? snapshot.limits.maxSeats, snapshot.limits.maxSeats),
            )}
          </div>
        </div>
      </div>

      <section className="table-card" style={{ marginTop: 20 }}>
        <h3>Checkout da assinatura</h3>
        <p className="muted">
          A base de checkout já está preparada com auditoria e idempotência. A ativação
          online ficará disponível quando um gateway de cobrança for configurado.
        </p>
        {checkouts.length ? (
          <div className="table-list">
            {checkouts.map((checkout) => (
              <div className="table-row" key={checkout.id}>
                <div>
                  <strong>{checkout.plan}</strong>
                  <div className="muted">
                    {checkout.seats} usuários · {checkout.status}
                    {checkout.provider ? ` · ${checkout.provider}` : ""}
                  </div>
                </div>
                <span className="muted">
                  {checkout.createdAt.toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="table-card" style={{ marginTop: 20 }}>
        <h3>Como os limites funcionam</h3>
        <p className="muted">
          O ClassDiary bloqueia novas inclusões antes de ultrapassar a capacidade contratada,
          sem remover ou esconder dados existentes. Upgrade de plano preserva todo o histórico.
        </p>
      </section>
    </main>
  );
}

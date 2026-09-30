import { requireSchoolRole } from "@/lib/rbac";
import { getOrganizationPlanUsage } from "@/lib/plans";
import { subscriptionAccessMessage, subscriptionAccessState } from "@/lib/subscription-lifecycle";

export const dynamic = "force-dynamic";

function quota(current: number, limit: number | null) {
  return limit === null ? `${current} / ilimitado` : `${current} / ${limit}`;
}

export default async function PlanPage() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);
  const snapshot = await getOrganizationPlanUsage(org.id);
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
        <h3>Como os limites funcionam</h3>
        <p className="muted">
          O ClassDiary bloqueia novas inclusões antes de ultrapassar a capacidade contratada,
          sem remover ou esconder dados existentes. Upgrade de plano preserva todo o histórico.
        </p>
      </section>
    </main>
  );
}

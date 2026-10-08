import { db } from "@/lib/db";
import { PLAN_CATALOG } from "@/lib/plans";

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
      <div className="admin-toolbar">
        <div><span className="badge">Comercial</span><h1>Planos & cobrança</h1><p className="muted">Limites efetivos usados pelo motor de capacidade do ClassDiary.</p></div>
      </div>
      <div className="admin-plan-grid">
        {Object.entries(PLAN_CATALOG).map(([code, plan]) => (
          <article className="admin-plan" key={code}>
            <span className="pill">{code}</span>
            <h2>{plan.label}</h2>
            <dl>
              <div><dt>Alunos</dt><dd>{plan.maxStudents ?? "Ilimitado"}</dd></div>
              <div><dt>Turmas</dt><dd>{plan.maxClasses ?? "Ilimitado"}</dd></div>
              <div><dt>Usuários</dt><dd>{plan.maxSeats ?? "Ilimitado"}</dd></div>
              <div><dt>Assinaturas</dt><dd>{count(code)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <section className="admin-section">
        <h2>Provedor de cobrança</h2>
        <p><span className={process.env.MERCADO_PAGO_ACCESS_TOKEN ? "admin-status ok" : "admin-status warn"}>Mercado Pago {process.env.MERCADO_PAGO_ACCESS_TOKEN ? "configurado" : "sem token"}</span></p>
        <p className="muted">Credenciais nunca são exibidas no painel. Somente o estado de configuração é mostrado.</p>
      </section>
    </main>
  );
}

import {
  createCostCenterAction,
  createExpenseAction,
  createRevenueAction,
  markExpensePaidAction,
} from "@/app/actions/enrollment-finance";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [centers, expenses, revenues, payments] = await Promise.all([
    db.costCenter.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: { name: "asc" },
    }),
    db.expense.findMany({
      where: { organizationId: org.id },
      include: { costCenter: true },
      orderBy: { dueAt: "desc" },
      take: 300,
    }),
    db.revenue.findMany({
      where: { organizationId: org.id },
      include: { costCenter: true },
      orderBy: { receivedAt: "desc" },
      take: 300,
    }),
    db.payment.findMany({
      where: {
        organizationId: org.id,
        paidAt: { gte: start, lt: end },
      },
    }),
  ]);

  const tuition = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const otherRevenue = revenues
    .filter((revenue) => revenue.receivedAt >= start && revenue.receivedAt < end)
    .reduce((sum, revenue) => sum + Number(revenue.amount), 0);

  const expensesPaid = expenses
    .filter((expense) => expense.paidAt && expense.paidAt >= start && expense.paidAt < end)
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  const result = tuition + otherRevenue - expensesPaid;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>DRE gerencial</h1>
          <div className="muted">Receitas, despesas e resultado do mês atual.</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Mensalidades recebidas</span>
          <div className="value">R$ {tuition.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <span className="muted">Outras receitas</span>
          <div className="value">R$ {otherRevenue.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <span className="muted">Despesas pagas</span>
          <div className="value">R$ {expensesPaid.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <span className="muted">Resultado</span>
          <div className="value">R$ {result.toFixed(2)}</div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Centro de custo</h3>
          <form action={createCostCenterAction} className="form-stack">
            <input name="name" required placeholder="Administrativo" />
            <input name="code" placeholder="ADM" />
            <button className="btn btn-primary">Criar centro</button>
          </form>
        </section>

        <section className="table-card">
          <h3>Nova receita</h3>
          <form action={createRevenueAction} className="form-stack">
            <select name="costCenterId">
              <option value="">Sem centro</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
            <input name="description" required placeholder="Descrição" />
            <input name="category" required placeholder="Categoria" />
            <input name="amount" type="number" step=".01" min=".01" required />
            <input name="receivedAt" type="date" required />
            <input name="source" placeholder="Origem" />
            <button className="btn btn-primary">Registrar receita</button>
          </form>
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Nova despesa</h3>
        <form action={createExpenseAction} className="form-grid compact">
          <select name="costCenterId">
            <option value="">Sem centro</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </select>
          <input name="description" required placeholder="Descrição" />
          <input name="category" required placeholder="Categoria" />
          <input name="amount" type="number" step=".01" min=".01" required />
          <input name="dueAt" type="date" required />
          <input name="supplier" placeholder="Fornecedor" />
          <button className="btn btn-primary">Adicionar despesa</button>
        </form>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Despesas</h3>
        {expenses.map((expense) => (
          <div className="table-row" key={expense.id}>
            <strong>{expense.description}</strong>
            <span>
              {expense.costCenter?.name ?? "Sem centro"} · R$ {Number(expense.amount).toFixed(2)} · {expense.status}
            </span>
            {expense.status !== "PAID" ? (
              <form action={markExpensePaidAction}>
                <input type="hidden" name="id" value={expense.id} />
                <button className="btn btn-light">Marcar paga</button>
              </form>
            ) : (
              <span>{expense.paidAt?.toLocaleDateString("pt-BR")}</span>
            )}
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Outras receitas</h3>
        {revenues.map((revenue) => (
          <div className="table-row" key={revenue.id}>
            <strong>{revenue.description}</strong>
            <span>{revenue.costCenter?.name ?? "Sem centro"} · {revenue.category}</span>
            <span>R$ {Number(revenue.amount).toFixed(2)}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

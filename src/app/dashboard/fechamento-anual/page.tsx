import { calculateAnnualResultsBatchAction } from "@/app/actions/academic-operations";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Fechamento anual</h1>
          <p className="muted">Nenhum ano letivo ativo.</p>
        </section>
      </main>
    );
  }

  const [periods, closures, students, results] = await Promise.all([
    db.academicPeriod.findMany({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
      },
      orderBy: { order: "asc" },
    }),
    db.periodClosure.findMany({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
      },
    }),
    db.student.count({
      where: {
        organizationId: org.id,
        active: true,
        enrollments: {
          some: {
            active: true,
            classGroup: { schoolYearId: year.id },
          },
        },
      },
    }),
    db.annualResult.findMany({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
      },
      include: { student: true },
      orderBy: { student: { name: "asc" } },
    }),
  ]);

  const promoted = results.filter(
    (result) => result.status === "PROMOTED",
  ).length;
  const retained = results.filter(
    (result) => result.status === "RETAINED",
  ).length;
  const pending = Math.max(0, students - results.length);
  const allPeriodsClosed =
    periods.length > 0 && closures.length >= periods.length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Fechamento anual</h1>
          <div className="muted">
            Ano letivo {year.name} · consolidação de resultados.
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="kpi">
          <span className="muted">Períodos fechados</span>
          <div className="value">
            {closures.length}/{periods.length}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Resultados calculados</span>
          <div className="value">
            {results.length}/{students}
          </div>
        </div>
        <div className="kpi">
          <span className="muted">Promovidos</span>
          <div className="value">{promoted}</div>
        </div>
        <div className="kpi">
          <span className="muted">Retidos</span>
          <div className="value">{retained}</div>
        </div>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Checklist anual</h3>
        {periods.map((period) => {
          const closed = closures.some(
            (closure) => closure.period === period.name,
          );

          return (
            <div className="table-row" key={period.id}>
              <strong>{period.name}</strong>
              <span>
                {period.startsAt.toLocaleDateString("pt-BR")} a{" "}
                {period.endsAt.toLocaleDateString("pt-BR")}
              </span>
              <span className="status">
                {closed ? "FECHADO" : "ABERTO"}
              </span>
            </div>
          );
        })}

        <div className="notice" style={{ marginTop: 12 }}>
          <strong>
            {allPeriodsClosed
              ? "Todos os períodos estão fechados."
              : "Existem períodos acadêmicos ainda abertos."}
          </strong>
          <div className="muted">
            O cálculo em lote consolida média e frequência do ano atual.
          </div>
        </div>

        <form
          action={calculateAnnualResultsBatchAction}
          style={{ marginTop: 12 }}
        >
          <button className="btn btn-primary">
            Recalcular resultados de todos os alunos
          </button>
        </form>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Resultados</h3>
        {pending > 0 ? (
          <p className="muted">
            {pending} aluno(s) ainda sem resultado anual calculado.
          </p>
        ) : null}

        {results.map((result) => (
          <div className="table-row" key={result.id}>
            <strong>{result.student.name}</strong>
            <span>
              Média {Number(result.finalAverage ?? 0).toFixed(2)} · Frequência{" "}
              {Number(result.attendancePercent ?? 100).toFixed(1)}%
            </span>
            <span className="status">{result.status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

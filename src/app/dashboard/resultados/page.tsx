import { calculateAnnualResultAction } from "@/app/actions/secretary";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  const [students, results] = await Promise.all([
    year
      ? db.student.findMany({
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
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    year
      ? db.annualResult.findMany({
          where: {
            organizationId: org.id,
            schoolYearId: year.id,
          },
          include: { student: true },
          orderBy: { student: { name: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Resultados anuais</h1>
          <div className="muted">
            {year
              ? `Ano letivo ${year.name} · promoção/retenção por nota e frequência.`
              : "Nenhum ano letivo ativo."}
          </div>
        </div>
      </div>

      {year ? (
        <section className="table-card">
          <form
            action={calculateAnnualResultAction}
            className="form-grid compact"
          >
            <select name="studentId">
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary">Calcular resultado</button>
          </form>
        </section>
      ) : null}

      <section className="table-card" style={{ marginTop: 16 }}>
        {results.map((result) => (
          <div className="table-row" key={result.id}>
            <strong>{result.student.name}</strong>
            <span>
              Média {result.finalAverage ? String(result.finalAverage) : "0"} ·
              Freq.{" "}
              {result.attendancePercent
                ? String(result.attendancePercent)
                : "100"}
              %
            </span>
            <span className="status">{result.status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

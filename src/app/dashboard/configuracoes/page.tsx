import { createAcademicPeriodAction, updateAcademicSettingsAction } from "@/app/actions/configuration";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);
  const year = await db.schoolYear.findFirst({ where: { organizationId: org.id, active: true } });
  const periods = year
    ? await db.academicPeriod.findMany({
        where: { organizationId: org.id, schoolYearId: year.id },
        orderBy: { order: "asc" },
      })
    : [];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Configurações acadêmicas</h1>
          <div className="muted">Critérios pedagógicos e períodos da escola.</div>
        </div>
      </div>

      <section className="table-card">
        <h3>Parâmetros</h3>
        <form action={updateAcademicSettingsAction} className="form-grid compact">
          <input name="timezone" defaultValue={org.timezone} />
          <input name="passingGrade" type="number" step=".01" min="0" max="10" defaultValue={String(org.passingGrade)} />
          <input name="attendanceWarningPercent" type="number" min="1" max="100" defaultValue={org.attendanceWarningPercent} />
          <button className="btn btn-primary">Salvar configurações</button>
        </form>
        <p className="muted">A nota mínima e a frequência de alerta alimentam os relatórios acadêmicos.</p>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Períodos acadêmicos {year ? `· ${year.name}` : ""}</h3>
        <form action={createAcademicPeriodAction} className="form-grid compact">
          <input name="name" required placeholder="1º Bimestre" />
          <input name="startsAt" type="date" required />
          <input name="endsAt" type="date" required />
          <input name="order" type="number" min="1" required placeholder="Ordem" />
          <button className="btn btn-primary">Adicionar período</button>
        </form>
        {periods.map((p) => (
          <div className="table-row" key={p.id}>
            <strong>{p.order}. {p.name}</strong>
            <span>{p.startsAt.toLocaleDateString("pt-BR")}</span>
            <span>{p.endsAt.toLocaleDateString("pt-BR")}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

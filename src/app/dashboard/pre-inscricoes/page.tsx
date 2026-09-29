import { convertEnrollmentLeadAction, updateEnrollmentLeadStatusAction } from "@/app/actions/enrollment-finance";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);
  const rows = await db.enrollmentLead.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Pré-inscrições</h1>
          <div className="muted">Captação pública, fila de espera e conversão em aluno.</div>
        </div>
        <a className="btn btn-light" href={"/matricula/" + org.slug} target="_blank">
          Abrir formulário público
        </a>
      </div>

      {rows.length === 0 ? (
        <section className="table-card"><p className="muted">Nenhuma pré-inscrição recebida.</p></section>
      ) : rows.map((row) => (
        <section className="table-card" style={{ marginBottom: 16 }} key={row.id}>
          <div className="page-head" style={{ marginBottom: 8 }}>
            <div>
              <h3>{row.studentName}</h3>
              <div className="muted">{row.guardianName} · {row.guardianPhone}</div>
            </div>
            <span className="status">{row.status}</span>
          </div>
          <p className="muted">
            {row.desiredGrade ?? "Série não informada"} · {row.desiredShift ?? "Turno não informado"} · {row.guardianEmail ?? "Sem e-mail"}
          </p>
          {row.notes ? <p>{row.notes}</p> : null}

          {!row.convertedStudentId ? (
            <div className="content-grid">
              <form action={updateEnrollmentLeadStatusAction} className="form-grid compact">
                <input type="hidden" name="id" value={row.id} />
                <select name="status" defaultValue={row.status}>
                  <option value="PRE_ENROLLMENT">Pré-inscrição</option>
                  <option value="WAITLIST">Fila de espera</option>
                  <option value="APPROVED">Aprovada</option>
                  <option value="REJECTED">Recusada</option>
                </select>
                <button className="btn btn-light">Atualizar status</button>
              </form>
              <form action={convertEnrollmentLeadAction}>
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-primary">Converter em aluno</button>
              </form>
            </div>
          ) : <span className="status">Aluno criado</span>}
        </section>
      ))}
    </main>
  );
}

import { importStudentsCsvAction } from "@/app/actions/secretary";
import { requireSchoolRole } from "@/lib/rbac";

export const dynamic="force-dynamic";

export default async function Page(){
  await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);
  return <main className="main"><div className="page-head"><div><h1>Importar alunos</h1><div className="muted">Importação em massa por CSV.</div></div></div>
    <section className="table-card">
      <p className="muted">Formato: Nome,Matrícula,Responsável,Telefone,E-mail. Máximo de 1000 linhas por importação.</p>
      <form action={importStudentsCsvAction} className="form-stack">
        <textarea name="csv" rows={18} required placeholder={"Nome,Matrícula,Responsável,Telefone,E-mail\nAluno Exemplo,2026001,Maria Exemplo,(13) 99999-9999,maria@email.com"} />
        <button className="btn btn-primary">Importar alunos</button>
      </form>
    </section>
  </main>;
}

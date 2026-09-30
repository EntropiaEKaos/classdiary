import Link from "next/link";
import { createStudentAction } from "@/app/actions/school";
import { db } from "@/lib/db";
import { hasModulePermission, requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireModulePermission("students", "view");
  const canCreate = await hasModulePermission("students", "create");

  const students = await db.student.findMany({
    where: { organizationId: org.id },
    orderBy: { name: "asc" },
    take: 200,
  });

  return <main className="main">
    <div className="page-head"><div><h1>Alunos</h1><div className="muted">{students.length} registros</div></div></div>

    {canCreate ? <section className="table-card">
      <h3>Novo aluno</h3>
      <form action={createStudentAction} className="form-grid compact">
        <input name="name" required placeholder="Nome completo"/>
        <input name="registration" required placeholder="Matrícula"/>
        <input name="guardianName" placeholder="Responsável"/>
        <input name="guardianPhone" placeholder="Telefone"/>
        <button className="btn btn-primary" type="submit">Cadastrar</button>
      </form>
    </section> : null}

    <section className="table-card" style={{marginTop:16}}>
      {students.length===0 ? <p className="muted">Nenhum aluno cadastrado.</p> : students.map((student)=>
        <div className="table-row" key={student.id}>
          <strong><Link href={"/dashboard/alunos/"+student.id}>{student.name}</Link></strong>
          <span>{student.registration}</span>
          <span>{student.active?"Ativo":"Inativo"}</span>
        </div>
      )}
    </section>
  </main>;
}

import { clockEmployeeAction, createEmployeeAction } from "@/app/actions/operations";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("hr","view");
  const employees=await db.employee.findMany({where:{organizationId:org.id},include:{timeEntries:{orderBy:{clockIn:"desc"},take:5}},orderBy:{name:"asc"}});
  return <main className="main"><div className="page-head"><div><h1>RH e colaboradores</h1><div className="muted">Cadastro, jornada e acompanhamento básico da equipe.</div></div></div>
    <section className="table-card"><form action={createEmployeeAction} className="form-grid">
      <input name="name" required placeholder="Nome"/><input name="email" type="email" placeholder="E-mail"/><input name="phone" placeholder="Telefone"/><input name="document" placeholder="CPF"/><input name="jobTitle" required placeholder="Cargo"/><input name="department" placeholder="Departamento"/><input name="hireDate" type="date"/><input name="salary" type="number" step=".01" min="0" placeholder="Salário"/><button className="btn btn-primary">Cadastrar colaborador</button>
    </form></section>
    <section className="table-card" style={{marginTop:16}}>{employees.map(e=>{const open=e.timeEntries.find(t=>!t.clockOut);return <div className="notice" key={e.id}><div className="page-head" style={{marginBottom:8}}><div><strong>{e.name}</strong><div className="muted">{e.jobTitle} · {e.department??"Sem departamento"}</div></div><span className="status">{e.active?"Ativo":"Inativo"}</span></div><form action={clockEmployeeAction}><input type="hidden" name="employeeId" value={e.id}/><button className="btn btn-light">{open?"Registrar saída":"Registrar entrada"}</button></form></div>})}</section>
  </main>;
}

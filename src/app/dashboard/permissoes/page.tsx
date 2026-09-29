import { upsertPermissionOverrideAction } from "@/app/actions/scale";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";
const modules=["academic","students","secretary","finance","crm","reports","messaging","hr","assets","inventory","library","transport","canteen","health","resources","maintenance","procurement","automation","quality","goals","bi","assistant","curriculum","pedagogy","assessments"];

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN"]);
  const memberships=await db.membership.findMany({
    where:{organizationId:org.id},
    include:{user:true,permissions:true},
    orderBy:{user:{name:"asc"}}
  });

  return <main className="main">
    <div className="page-head"><div><h1>Permissões por módulo</h1><div className="muted">Exceções finas além do papel padrão do usuário.</div></div></div>
    {memberships.map(m=><section className="table-card" style={{marginBottom:16}} key={m.id}>
      <h3>{m.user.name} · {m.role}</h3>
      {modules.map(module=>{
        const current=m.permissions.find(p=>p.module===module);
        return <form action={upsertPermissionOverrideAction} className="table-row" key={module}>
          <input type="hidden" name="membershipId" value={m.id}/>
          <input type="hidden" name="module" value={module}/>
          <strong>{module}</strong>
          <label><input type="checkbox" name="canView" defaultChecked={current?.canView??false}/> Ver</label>
          <label><input type="checkbox" name="canCreate" defaultChecked={current?.canCreate??false}/> Criar</label>
          <label><input type="checkbox" name="canUpdate" defaultChecked={current?.canUpdate??false}/> Editar</label>
          <label><input type="checkbox" name="canDelete" defaultChecked={current?.canDelete??false}/> Excluir</label>
          <button className="btn btn-light">Salvar</button>
        </form>;
      })}
    </section>)}
  </main>;
}

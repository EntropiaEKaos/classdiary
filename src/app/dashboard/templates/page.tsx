import { createDocumentTemplateAction } from "@/app/actions/scale";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("secretary","view");
  const rows=await db.documentTemplate.findMany({where:{organizationId:org.id},orderBy:{name:"asc"}});
  return <main className="main">
    <div className="page-head"><div><h1>Templates</h1><div className="muted">Modelos de contratos, declarações e documentos.</div></div></div>
    <section className="table-card">
      <form action={createDocumentTemplateAction} className="form-stack">
        <div className="form-grid compact"><input name="code" required placeholder="DECL_MATRICULA"/><input name="name" required placeholder="Declaração de matrícula"/><select name="type"><option value="DOCUMENT">Documento</option><option value="CONTRACT">Contrato</option><option value="MESSAGE">Mensagem</option></select></div>
        <textarea name="body" rows={12} required placeholder="Use variáveis como {{student}}, {{registration}}, {{school}}, {{date}}"/>
        <button className="btn btn-primary">Salvar template</button>
      </form>
    </section>
    <section className="table-card" style={{marginTop:16}}>{rows.map(r=><div className="notice" key={r.id}><strong>{r.name} · {r.code}</strong><div className="muted">{r.type} · {r.active?"Ativo":"Inativo"}</div><pre style={{whiteSpace:"pre-wrap"}}>{r.body.slice(0,500)}</pre></div>)}</section>
  </main>;
}

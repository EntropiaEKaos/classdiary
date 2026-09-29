import { registerFileAssetAction } from "@/app/actions/scale";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("secretary","view");
  const files=await db.fileAsset.findMany({where:{organizationId:org.id},include:{uploadedBy:true},orderBy:{createdAt:"desc"},take:300});
  return <main className="main">
    <div className="page-head"><div><h1>Arquivos e anexos</h1><div className="muted">Catálogo de arquivos por tenant, preparado para storage externo.</div></div></div>
    <section className="table-card"><form action={registerFileAssetAction} className="form-grid">
      <input name="originalName" required placeholder="Nome do arquivo"/>
      <input name="mimeType" required placeholder="application/pdf"/>
      <input name="sizeBytes" type="number" min="0" required placeholder="Tamanho em bytes"/>
      <input name="publicUrl" type="url" required placeholder="URL do storage"/>
      <input name="category" required placeholder="DOCUMENT"/>
      <input name="entityType" placeholder="Student"/>
      <input name="entityId" placeholder="ID da entidade"/>
      <button className="btn btn-primary">Registrar arquivo</button>
    </form></section>
    <section className="table-card" style={{marginTop:16}}>{files.map(f=><div className="table-row" key={f.id}><strong>{f.originalName}</strong><span>{f.category} · {f.mimeType}</span><span>{f.uploadedBy.name}</span><a href={f.publicUrl??"#"} target="_blank">Abrir</a></div>)}</section>
  </main>;
}

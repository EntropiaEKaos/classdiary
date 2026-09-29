import { createAcademicDocumentAction, generateDocumentFromTemplateAction } from "@/app/actions/learning";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);
  const [students,docs,templates]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    db.academicDocument.findMany({where:{organizationId:org.id},include:{student:true,author:true},orderBy:{createdAt:"desc"}}),
    db.documentTemplate.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}})
  ]);

  return <main className="main">
    <div className="page-head">
      <div>
        <h1>Documentos escolares</h1>
        <div className="muted">Declarações, históricos e documentos gerados por templates.</div>
      </div>
    </div>

    <div className="content-grid">
      <section className="table-card">
        <h3>Emissão rápida</h3>
        <form action={createAcademicDocumentAction} className="form-stack">
          <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="type">
            <option value="DECLARATION">Declaração</option>
            <option value="ENROLLMENT">Declaração de matrícula</option>
            <option value="TRANSFER">Transferência</option>
            <option value="HISTORY">Histórico escolar</option>
          </select>
          <input name="title" required placeholder="Título do documento"/>
          <button className="btn btn-primary">Emitir registro</button>
        </form>
      </section>

      <section className="table-card">
        <h3>Gerar por template</h3>
        <form action={generateDocumentFromTemplateAction} className="form-stack">
          <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="templateId">{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input name="title" required placeholder="Título final"/>
          <button className="btn btn-primary">Gerar documento</button>
        </form>
      </section>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Histórico de emissões</h3>
      {docs.map(d=><div className="table-row" key={d.id}>
        <strong>{d.title}</strong>
        <span>{d.student.name} · {d.type}</span>
        <span>{d.author.name}</span>
        <a href={"/api/documentos/"+d.id} target="_blank">Abrir PDF</a>
      </div>)}
    </section>
  </main>;
}

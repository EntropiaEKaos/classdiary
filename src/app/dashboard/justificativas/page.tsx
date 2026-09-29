import { reviewAbsenceJustificationAction } from "@/app/actions/engagement";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);
  const rows=await db.absenceJustification.findMany({where:{organizationId:org.id},include:{student:true,createdBy:true,attendance:{include:{lesson:{include:{subject:true,classGroup:true}}}}},orderBy:{createdAt:"desc"},take:200});
  return <main className="main"><div className="page-head"><div><h1>Justificativas de falta</h1><div className="muted">Analise solicitações enviadas por alunos e responsáveis.</div></div></div>{rows.map(r=><section className="table-card" style={{marginBottom:16}} key={r.id}><h3>{r.student.name} · {r.attendance.lesson.subject.name}</h3><p className="muted">{r.attendance.lesson.classGroup.name} · enviado por {r.createdBy.name}</p><p>{r.reason}</p>{r.attachmentUrl?<a href={r.attachmentUrl} target="_blank">Ver anexo</a>:null}<p>Status: <strong>{r.status}</strong></p>{r.status==="PENDING"?<form action={reviewAbsenceJustificationAction} className="form-grid compact"><input type="hidden" name="id" value={r.id}/><input name="reviewNote" placeholder="Observação"/><button name="decision" value="APPROVED" className="btn btn-primary">Aprovar</button><button name="decision" value="REJECTED" className="btn btn-light">Recusar</button></form>:null}</section>)}</main>;
}

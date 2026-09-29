import { reviewGradeRequestAction } from "@/app/actions/engagement";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {user,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","TEACHER"]);
  const isAdmin=user.memberships.some(m=>m.organizationId===org.id&&(m.role==="SCHOOL_ADMIN"||m.role==="COORDINATOR"));
  const rows=await db.gradeReviewRequest.findMany({
    where:{organizationId:org.id,...(!isAdmin?{grade:{authorId:user.id}}:{})},
    include:{student:true,createdBy:true,grade:{include:{subject:true}}},
    orderBy:{createdAt:"desc"},take:200
  });
  return <main className="main"><div className="page-head"><div><h1>Revisões de nota</h1><div className="muted">Solicitações de aluno ou responsável.</div></div></div>{rows.map(r=><section className="table-card" style={{marginBottom:16}} key={r.id}><h3>{r.student.name} · {r.grade.subject.name}</h3><p>Nota atual: <strong>{String(r.grade.value)}/{String(r.grade.maxValue)}</strong></p><p className="muted">Solicitado por {r.createdBy.name}</p><p>{r.reason}</p><p>Status: <strong>{r.status}</strong></p>{r.status==="PENDING"?<form action={reviewGradeRequestAction} className="form-grid compact"><input type="hidden" name="id" value={r.id}/><input name="response" placeholder="Resposta"/><input name="proposedValue" type="number" step=".01" min="0" max={String(r.grade.maxValue)} placeholder="Nova nota"/><button name="decision" value="APPROVED" className="btn btn-primary">Aprovar</button><button name="decision" value="REJECTED" className="btn btn-light">Recusar</button></form>:null}</section>)}</main>;
}

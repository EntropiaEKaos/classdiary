import { submitSurveyResponseAction } from "@/app/actions/intelligence";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic="force-dynamic";

export default async function Page(){
  const user=await requireUser();
  const org=await activeOrganization();
  if(!org) redirect("/onboarding");

  const roles=user.memberships.filter(m=>m.organizationId===org.id).map(m=>m.role);
  const audiences=["ALL",...(roles.includes("STUDENT")?["STUDENTS"]:[]),...(roles.includes("GUARDIAN")?["GUARDIANS"]:[]),...(roles.some(r=>["SCHOOL_ADMIN","COORDINATOR","TEACHER","SECRETARY"].includes(r))?["STAFF"]:[])];

  const rows=await db.survey.findMany({
    where:{
      organizationId:org.id,
      active:true,
      audience:{in:audiences},
      OR:[{startsAt:null},{startsAt:{lte:new Date()}}],
      AND:[{OR:[{endsAt:null},{endsAt:{gte:new Date()}}]}]
    },
    include:{questions:true,responses:{where:{respondentRef:user.id}}},
    orderBy:{createdAt:"desc"}
  });

  return <main className="main"><div className="page-head"><div><h1>Pesquisas</h1><div className="muted">Sua opinião ajuda a escola a melhorar.</div></div></div>
    {rows.length===0?<section className="table-card"><p className="muted">Nenhuma pesquisa disponível.</p></section>:rows.map(s=><section className="table-card" style={{marginBottom:16}} key={s.id}><h3>{s.title}</h3>{s.responses.length?<span className="status">Respondida</span>:s.questions.slice(0,1).map(q=><form action={submitSurveyResponseAction} className="form-stack" key={q.id}><input type="hidden" name="surveyId" value={s.id}/><input type="hidden" name="questionId" value={q.id}/><label>{q.prompt}<input name="score" type="number" min="0" max="10" required placeholder="0 a 10"/></label><textarea name="comment" rows={4} placeholder="Comentário opcional"/><button className="btn btn-primary">Enviar resposta</button></form>)}</section>)}
  </main>;
}

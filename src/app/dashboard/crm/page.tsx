import { addLeadInteractionAction } from "@/app/actions/scale";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("crm","view");
  const leads=await db.enrollmentLead.findMany({
    where:{organizationId:org.id},
    include:{interactions:{include:{author:true},orderBy:{createdAt:"desc"}}},
    orderBy:{updatedAt:"desc"},
    take:500
  });

  const stages=["PRE_ENROLLMENT","WAITLIST","APPROVED","CONVERTED","REJECTED"];
  const counts=Object.fromEntries(stages.map(stage=>[stage,leads.filter(l=>l.status===stage).length]));

  return <main className="main">
    <div className="page-head"><div><h1>CRM de captação</h1><div className="muted">Funil comercial, contatos e próximos follow-ups.</div></div></div>
    <div className="dashboard-grid">
      {stages.slice(0,4).map(stage=><div className="kpi" key={stage}><span className="muted">{stage}</span><div className="value">{counts[stage]}</div></div>)}
    </div>
    {leads.map(lead=>{
      const next=lead.interactions.map(i=>i.nextFollowUpAt).filter((x):x is Date=>Boolean(x)).sort((a,b)=>a.getTime()-b.getTime())[0];
      return <section className="table-card" style={{marginTop:16}} key={lead.id}>
        <div className="page-head" style={{marginBottom:8}}><div><h3>{lead.studentName}</h3><div className="muted">{lead.guardianName} · {lead.guardianPhone}</div></div><span className="status">{lead.status}</span></div>
        <p className="muted">Origem: {lead.source??"Não informada"} · Próximo contato: {next?next.toLocaleString("pt-BR"):"não agendado"}</p>
        <form action={addLeadInteractionAction} className="form-grid">
          <input type="hidden" name="leadId" value={lead.id}/>
          <select name="type"><option value="CALL">Ligação</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="MEETING">Reunião</option><option value="NOTE">Nota</option></select>
          <input name="note" required placeholder="Resumo do contato"/>
          <input name="nextFollowUpAt" type="datetime-local"/>
          <button className="btn btn-primary">Registrar interação</button>
        </form>
        {lead.interactions.slice(0,5).map(i=><div className="notice" key={i.id}><strong>{i.type} · {i.author.name}</strong><div>{i.note}</div><small className="muted">{i.createdAt.toLocaleString("pt-BR")}</small></div>)}
      </section>;
    })}
  </main>;
}

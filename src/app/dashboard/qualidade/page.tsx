import { createSurveyAction } from "@/app/actions/intelligence";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function nps(scores:number[]){
  if(!scores.length) return 0;
  const promoters=scores.filter(s=>s>=9).length;
  const detractors=scores.filter(s=>s<=6).length;
  return ((promoters-detractors)/scores.length)*100;
}

export default async function Page(){
  const {org}=await requireModulePermission("quality","view");
  const surveys=await db.survey.findMany({
    where:{organizationId:org.id},
    include:{responses:true,questions:true},
    orderBy:{createdAt:"desc"}
  });

  const allScores=surveys.flatMap(s=>s.responses.map(r=>r.score).filter((x):x is number=>x!==null));
  const comments=surveys.flatMap(s=>s.responses.filter(r=>r.comment).map(r=>({id:r.id,comment:r.comment!,createdAt:r.createdAt,survey:s.title}))).slice(0,20);

  return <main className="main">
    <div className="page-head"><div><h1>Qualidade e NPS</h1><div className="muted">Avaliação institucional e percepção da comunidade escolar.</div></div></div>

    <div className="dashboard-grid">
      <div className="kpi"><span className="muted">Pesquisas</span><div className="value">{surveys.length}</div></div>
      <div className="kpi"><span className="muted">Respostas</span><div className="value">{allScores.length}</div></div>
      <div className="kpi"><span className="muted">NPS consolidado</span><div className="value">{nps(allScores).toFixed(0)}</div></div>
      <div className="kpi"><span className="muted">Média de satisfação</span><div className="value">{allScores.length?(allScores.reduce((a,b)=>a+b,0)/allScores.length).toFixed(1):"0.0"}</div></div>
    </div>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Nova pesquisa</h3>
      <form action={createSurveyAction} className="form-grid">
        <input name="title" required placeholder="Pesquisa de satisfação 2026"/>
        <select name="audience"><option value="ALL">Todos</option><option value="STUDENTS">Alunos</option><option value="GUARDIANS">Responsáveis</option><option value="STAFF">Equipe</option></select>
        <select name="type"><option value="NPS">NPS</option><option value="SATISFACTION">Satisfação</option><option value="CUSTOM">Personalizada</option></select>
        <input name="question" required placeholder="De 0 a 10, quanto você recomendaria a escola?"/>
        <input name="startsAt" type="datetime-local"/>
        <input name="endsAt" type="datetime-local"/>
        <button className="btn btn-primary">Criar pesquisa</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Pesquisas</h3>
      {surveys.map(s=>{
        const scores=s.responses.map(r=>r.score).filter((x):x is number=>x!==null);
        return <div className="table-row" key={s.id}>
          <strong>{s.title}</strong>
          <span>{s.audience} · {s.responses.length} respostas</span>
          <span>NPS {nps(scores).toFixed(0)}</span>
        </div>;
      })}
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Comentários recentes</h3>
      {comments.length===0?<p className="muted">Nenhum comentário recebido.</p>:comments.map(c=><div className="notice" key={c.id}><strong>{c.survey}</strong><div>{c.comment}</div><small className="muted">{c.createdAt.toLocaleString("pt-BR")}</small></div>)}
    </section>
  </main>;
}

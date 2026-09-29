import { createPedagogicalGoalAction, recalculateGoalsAction } from "@/app/actions/intelligence";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("goals","view");
  const [goals,classes,teachers]=await Promise.all([
    db.pedagogicalGoal.findMany({where:{organizationId:org.id},orderBy:{endsAt:"asc"}}),
    db.classGroup.findMany({where:{organizationId:org.id},orderBy:{name:"asc"}}),
    db.membership.findMany({where:{organizationId:org.id,role:"TEACHER"},include:{user:true},orderBy:{user:{name:"asc"}}})
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Metas pedagógicas</h1><div className="muted">Objetivos mensuráveis por escola, turma ou professor.</div></div><form action={recalculateGoalsAction}><button className="btn btn-primary">Recalcular indicadores</button></form></div>

    <section className="table-card">
      <form action={createPedagogicalGoalAction} className="form-grid">
        <input name="title" required placeholder="Elevar frequência do 7º Ano"/>
        <select name="scopeType"><option value="SCHOOL">Escola</option><option value="CLASS">Turma</option><option value="TEACHER">Professor</option></select>
        <select name="scopeId"><option value="">Escopo geral</option>{classes.map(c=><option key={c.id} value={c.id}>Turma · {c.name}</option>)}{teachers.map(t=><option key={t.user.id} value={t.user.id}>Professor · {t.user.name}</option>)}</select>
        <select name="metric"><option value="AVERAGE_GRADE">Média acadêmica</option><option value="ATTENDANCE">Frequência %</option><option value="LESSONS">Aulas registradas</option><option value="ASSIGNMENT_DELIVERY">Entrega de atividades %</option></select>
        <input name="targetValue" type="number" step=".01" min="0" required placeholder="Meta"/>
        <input name="startsAt" type="date" required/>
        <input name="endsAt" type="date" required/>
        <input name="notes" placeholder="Observações"/>
        <button className="btn btn-primary">Criar meta</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      {goals.length===0?<p className="muted">Nenhuma meta cadastrada.</p>:goals.map(g=>{
        const target=Number(g.targetValue);const current=Number(g.currentValue);const pct=target>0?Math.min(100,(current/target)*100):0;
        return <div className="notice" key={g.id}>
          <div className="page-head" style={{marginBottom:8}}><div><strong>{g.title}</strong><div className="muted">{g.scopeType} · {g.metric}</div></div><span className="status">{g.status}</span></div>
          <div>Atual {current.toFixed(2)} / Meta {target.toFixed(2)}</div>
          <div style={{height:10,background:"#e5e7eb",borderRadius:999,marginTop:8,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:"currentColor"}}/></div>
          <small className="muted">Prazo até {g.endsAt.toLocaleDateString("pt-BR")}</small>
        </div>;
      })}
    </section>
  </main>;
}

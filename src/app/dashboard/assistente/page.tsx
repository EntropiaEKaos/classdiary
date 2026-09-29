import { askAdministrativeAssistantAction } from "@/app/actions/intelligence";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;a?:string}>}){
  const {user,org}=await requireModulePermission("assistant","view");
  const params=await searchParams;
  const history=await db.assistantQueryLog.findMany({where:{organizationId:org.id,userId:user.id},orderBy:{createdAt:"desc"},take:20});

  return <main className="main">
    <div className="page-head"><div><h1>Assistente administrativo</h1><div className="muted">Modo somente leitura: consulta indicadores, não altera dados.</div></div></div>

    <section className="table-card">
      <form action={askAdministrativeAssistantAction} className="form-stack">
        <input name="question" required placeholder="Ex.: Como está a inadimplência? Qual é a frequência média?"/>
        <button className="btn btn-primary">Analisar</button>
      </form>
    </section>

    {params.a?<section className="table-card" style={{marginTop:16}}><h3>{params.q}</h3><p>{params.a}</p><div className="muted">Resposta baseada apenas nos dados autorizados da escola ativa.</div></section>:null}

    <section className="table-card" style={{marginTop:16}}>
      <h3>Consultas recentes</h3>
      {history.map(h=><div className="notice" key={h.id}><strong>{h.question}</strong><div>{h.responseSummary}</div><small className="muted">{h.intent} · {h.createdAt.toLocaleString("pt-BR")}</small></div>)}
    </section>
  </main>;
}

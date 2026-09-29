import { createCollectionRuleAction, runCollectionAutomationAction } from "@/app/actions/scale";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page(){
  const {org}=await requireModulePermission("finance","view");
  const rules=await db.collectionRule.findMany({
    where:{organizationId:org.id},
    orderBy:{createdAt:"desc"}
  });

  return <main className="main">
    <div className="page-head">
      <div>
        <h1>Automações de cobrança</h1>
        <div className="muted">Lembretes antes/depois do vencimento e notificações internas.</div>
      </div>
      <form action={runCollectionAutomationAction}>
        <button className="btn btn-primary">Executar regras agora</button>
      </form>
    </div>

    <section className="table-card">
      <h3>Nova regra</h3>
      <form action={createCollectionRuleAction} className="form-grid">
        <input name="name" required placeholder="Lembrete 3 dias antes"/>
        <input name="daysBeforeDue" type="number" min="0" placeholder="Dias antes"/>
        <input name="daysAfterDue" type="number" min="0" placeholder="Dias após"/>
        <select name="channel">
          <option value="IN_APP">Notificação interna</option>
          <option value="EMAIL">E-mail (preparado)</option>
          <option value="WHATSAPP">WhatsApp (preparado)</option>
        </select>
        <input name="messageTemplate" required placeholder="Olá, {{student}}. A cobrança {{description}} vence em {{dueDate}}."/>
        <button className="btn btn-primary">Criar regra</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      <h3>Regras configuradas</h3>
      {rules.length===0?<p className="muted">Nenhuma regra criada.</p>:rules.map(rule=>
        <div className="notice" key={rule.id}>
          <strong>{rule.name}</strong>
          <div className="muted">
            {rule.channel} · {rule.active?"Ativa":"Inativa"} · 
            {rule.daysBeforeDue!==null?" "+rule.daysBeforeDue+" dias antes":""}
            {rule.daysAfterDue!==null?" "+rule.daysAfterDue+" dias após":""}
          </div>
          <div>{rule.messageTemplate}</div>
        </div>
      )}
    </section>
  </main>;
}

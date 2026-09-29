import Link from "next/link";
import { createConversationAction } from "@/app/actions/engagement";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const [members, conversations] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: org.id, userId: { not: user.id } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.conversation.findMany({
      where: {
        organizationId: org.id,
        participants: { some: { userId: user.id } },
      },
      include: {
        participants: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return <main className="main">
    <div className="page-head"><div><h1>Mensagens</h1><div className="muted">Comunicação interna da comunidade escolar.</div></div></div>
    <section className="table-card">
      <h3>Nova conversa</h3>
      <form action={createConversationAction} className="form-grid">
        <select name="recipientId">{members.map(m=><option key={m.userId} value={m.userId}>{m.user.name} · {m.role}</option>)}</select>
        <input name="subject" required placeholder="Assunto"/>
        <input name="body" required placeholder="Mensagem"/>
        <button className="btn btn-primary">Enviar</button>
      </form>
    </section>
    <section className="table-card" style={{marginTop:16}}>
      {conversations.length===0?<p className="muted">Nenhuma conversa ainda.</p>:conversations.map(c=>{
        const names=c.participants.filter(p=>p.userId!==user.id).map(p=>p.user.name).join(", ");
        return <Link href={"/mensagens/"+c.id} className="notice" key={c.id}><strong>{c.subject}</strong><div className="muted">{names||"Conversa"} · {c.messages[0]?.body??"Sem mensagens"}</div></Link>;
      })}
    </section>
  </main>;
}

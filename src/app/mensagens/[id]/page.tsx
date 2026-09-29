import { replyConversationAction } from "@/app/actions/engagement";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({params}:{params:Promise<{id:string}>}) {
  const user=await requireUser(); const org=await activeOrganization(); if(!org) redirect("/onboarding");
  const {id}=await params;
  const conversation=await db.conversation.findFirst({
    where:{id,organizationId:org.id,participants:{some:{userId:user.id}}},
    include:{messages:{include:{sender:true},orderBy:{createdAt:"asc"}},participants:true},
  });
  if(!conversation) notFound();

  await db.conversationParticipant.updateMany({
    where:{conversationId:conversation.id,userId:user.id},
    data:{lastReadAt:new Date()},
  });

  return <main className="main"><div className="page-head"><div><h1>{conversation.subject}</h1><div className="muted">Conversa interna</div></div></div>
    <section className="table-card">{conversation.messages.map(m=><div className="notice" key={m.id}><strong>{m.sender.name}</strong><div>{m.body}</div><small className="muted">{m.createdAt.toLocaleString("pt-BR")}</small></div>)}</section>
    <section className="table-card" style={{marginTop:16}}><form action={replyConversationAction} className="form-stack"><input type="hidden" name="conversationId" value={conversation.id}/><input name="body" required placeholder="Escreva uma resposta"/><button className="btn btn-primary">Responder</button></form></section>
  </main>;
}

import Link from "next/link";
import { ArrowLeft, ExternalLink, Paperclip, Send } from "lucide-react";
import { replyConversationAction } from "@/app/actions/engagement";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FormFeedback } from "@/components/form-feedback";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const { id } = await params;
  const conversation = await db.conversation.findFirst({
    where: {
      id,
      organizationId: org.id,
      participants: { some: { userId: user.id } },
    },
    include: {
      messages: { include: { sender: true }, orderBy: { createdAt: "asc" } },
      participants: { include: { user: true } },
    },
  });

  if (!conversation) notFound();

  await db.conversationParticipant.updateMany({
    where: { conversationId: conversation.id, userId: user.id },
    data: { lastReadAt: new Date() },
  });

  const others = conversation.participants.filter((participant) => participant.userId !== user.id);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <Link className="page-back-button" href="/mensagens">
            <ArrowLeft size={16}/>Voltar às mensagens
          </Link>
          <span className="badge">Conversa</span>
          <h1>{conversation.subject}</h1>
          <div className="muted">
            {others.map((participant) => participant.user.name).join(", ") || "Conversa interna"}
          </div>
        </div>
      </div>

      <section className="chat-card">
        <div className="chat-stream">
          {conversation.messages.map((message) => {
            const mine = message.senderId === user.id;
            const read = mine && others.every(
              (participant) =>
                participant.lastReadAt && participant.lastReadAt >= message.createdAt,
            );

            return (
              <article className={"chat-bubble " + (mine ? "mine" : "")} key={message.id}>
                <div className="chat-author">{mine ? "Você" : message.sender.name}</div>
                <div>{message.body}</div>
                {message.attachmentUrl ? (
                  <a
                    className="chat-attachment"
                    href={message.attachmentUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Paperclip size={14}/>Abrir anexo<ExternalLink size={12}/>
                  </a>
                ) : null}
                <small>
                  {message.createdAt.toLocaleString("pt-BR")}
                  {mine ? " · " + (read ? "Lida" : "Enviada") : ""}
                </small>
              </article>
            );
          })}
        </div>

        <form action={replyConversationAction} className="chat-compose">
          <input type="hidden" name="conversationId" value={conversation.id}/>
          <textarea name="body" required rows={2} placeholder="Escreva uma resposta..."/>
          <input name="attachmentUrl" type="url" placeholder="Link de anexo (opcional)"/>
          <button className="btn btn-primary"><Send size={16}/>Responder</button>
          <FormFeedback message="Resposta enviada."/>
        </form>
      </section>
    </main>
  );
}

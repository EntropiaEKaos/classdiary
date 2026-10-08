import Link from "next/link";
import { ArrowLeft, MessageCircle, Paperclip, Search } from "lucide-react";
import { createConversationAction } from "@/app/actions/engagement";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { FormFeedback } from "@/components/form-feedback";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const { q: raw } = await searchParams;
  const q = String(raw ?? "").trim();

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
        ...(q
          ? {
              OR: [
                { subject: { contains: q, mode: "insensitive" } },
                {
                  participants: {
                    some: {
                      user: { name: { contains: q, mode: "insensitive" } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        participants: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <Link className="page-back-button" href="/dashboard">
            <ArrowLeft size={16}/>Voltar ao dashboard
          </Link>
          <span className="badge">Mensagens</span>
          <h1>Conversas</h1>
          <div className="muted">Comunicação interna com contexto, leitura e anexos.</div>
        </div>
      </div>

      <div className="messages-layout">
        <aside className="table-card conversations-panel">
          <form className="conversation-search" action="/mensagens" method="get">
            <Search size={16}/>
            <input name="q" defaultValue={q} placeholder="Buscar conversa..."/>
          </form>

          {conversations.length ? conversations.map((conversation) => {
            const participant = conversation.participants.find((item) => item.userId === user.id);
            const last = conversation.messages[0];
            const unread = Boolean(
              last &&
              last.senderId !== user.id &&
              (!participant?.lastReadAt || last.createdAt > participant.lastReadAt),
            );
            const names = conversation.participants
              .filter((item) => item.userId !== user.id)
              .map((item) => item.user.name)
              .join(", ");

            return (
              <Link
                href={"/mensagens/" + conversation.id}
                className={"conversation-card " + (unread ? "unread" : "")}
                key={conversation.id}
              >
                <span className="conversation-avatar">{(names || "C").slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{conversation.subject}</strong>
                  <small>{names || "Conversa"}</small>
                  <em>{last?.body ?? "Sem mensagens"}</em>
                </span>
                {unread ? <i aria-label="Não lida"/> : null}
              </Link>
            );
          }) : (
            <EmptyState
              title="Nenhuma conversa"
              description="Quando você iniciar uma conversa, ela aparecerá aqui."
            />
          )}
        </aside>

        <section className="table-card new-message-panel">
          <div className="section-icon-title">
            <MessageCircle size={20}/>
            <div>
              <strong>Nova conversa</strong>
              <span>Envie uma mensagem para alguém da sua escola.</span>
            </div>
          </div>

          <form action={createConversationAction} className="form-stack">
            <label>
              Destinatário
              <select name="recipientId" required>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.user.name} · {member.role}
                  </option>
                ))}
              </select>
            </label>
            <label>Assunto<input name="subject" required placeholder="Ex.: Reunião pedagógica"/></label>
            <label>Mensagem<textarea name="body" required rows={5} placeholder="Escreva sua mensagem..."/></label>
            <label>
              Anexo por link <span className="muted">(opcional)</span>
              <div className="input-with-icon">
                <Paperclip size={16}/>
                <input name="attachmentUrl" type="url" placeholder="https://..."/>
              </div>
            </label>
            <button className="btn btn-primary">Enviar mensagem</button>
            <FormFeedback message="Mensagem enviada."/>
          </form>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ArrowLeft, Bell, CheckCheck, CircleDot } from "lucide-react";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/engagement";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { FormFeedback } from "@/components/form-feedback";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const { status } = await searchParams;
  const unreadOnly = status === "unread";

  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: {
        organizationId: org.id,
        userId: user.id,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.notification.count({
      where: { organizationId: org.id, userId: user.id, readAt: null },
    }),
  ]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <Link className="page-back-button" href="/dashboard">
            <ArrowLeft size={16}/>Voltar ao dashboard
          </Link>
          <span className="badge">Central</span>
          <h1>Notificações</h1>
          <div className="muted">{unread} não lidas</div>
        </div>

        {unread ? (
          <form action={markAllNotificationsReadAction}>
            <button className="btn btn-light"><CheckCheck size={16}/>Marcar todas como lidas</button>
            <FormFeedback message="Todas as notificações foram marcadas como lidas."/>
          </form>
        ) : null}
      </div>

      <div className="notification-filter">
        <Link className={!unreadOnly ? "active" : ""} href="/notificacoes">Todas</Link>
        <Link className={unreadOnly ? "active" : ""} href="/notificacoes?status=unread">
          Não lidas {unread ? "(" + unread + ")" : ""}
        </Link>
      </div>

      <section className="notifications-list">
        {rows.length === 0 ? (
          <EmptyState
            title={unreadOnly ? "Nenhuma pendência" : "Nenhuma notificação"}
            description={
              unreadOnly
                ? "Você leu tudo. Bom trabalho!"
                : "As atualizações importantes aparecerão aqui."
            }
          />
        ) : rows.map((row) => (
          <article className={"notification-card " + (row.readAt ? "" : "unread")} key={row.id}>
            <span className="notification-card-icon">
              {row.readAt ? <Bell size={18}/> : <CircleDot size={18}/>}
            </span>
            <div>
              <div className="notification-card-title">
                <strong>{row.title}</strong>
                <small>{row.createdAt.toLocaleString("pt-BR")}</small>
              </div>
              <p>{row.body}</p>
              <div className="notification-actions">
                {row.href ? <Link className="btn btn-light" href={row.href}>Abrir</Link> : null}
                {!row.readAt ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={row.id}/>
                    <button className="btn btn-light">Marcar como lida</button>
                    <FormFeedback message="Notificação marcada como lida."/>
                  </form>
                ) : (
                  <span className="status">Lida</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

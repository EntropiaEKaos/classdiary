"use client";

import Link from "next/link";
import { Bell, CheckCheck, X } from "lucide-react";
import { useState } from "react";

type RecentNotification = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
};

export function NotificationsBell({
  unread,
  recent,
}: {
  unread: number;
  recent: RecentNotification[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="notification-bell">
      <button
        aria-expanded={open}
        aria-label={unread ? "Notificações, " + unread + " não lidas" : "Notificações"}
        className="icon-action"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bell size={18} />
        {unread ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="notification-popover">
          <div className="notification-popover-head">
            <div><strong>Notificações</strong><span>{unread} não lidas</span></div>
            <button aria-label="Fechar notificações" className="icon-action small" onClick={() => setOpen(false)} type="button">
              <X size={16} />
            </button>
          </div>
          <div className="notification-popover-list">
            {recent.length ? recent.map((item) => (
              <Link
                className={"notification-preview " + (item.read ? "" : "unread")}
                href={item.href ?? "/notificacoes"}
                key={item.id}
                onClick={() => setOpen(false)}
              >
                <strong>{item.title}</strong>
                <span>{item.body ?? "Nova atualização"}</span>
                <small>{new Date(item.createdAt).toLocaleString("pt-BR")}</small>
              </Link>
            )) : (
              <div className="notification-popover-empty"><CheckCheck size={20}/><span>Tudo em dia por aqui.</span></div>
            )}
          </div>
          <Link className="notification-popover-footer" href="/notificacoes" onClick={() => setOpen(false)}>
            Abrir central de notificações
          </Link>
        </div>
      ) : null}
    </div>
  );
}

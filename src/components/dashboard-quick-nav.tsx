"use client";

import Link from "next/link";
import { CalendarCheck2, MessageCircle, Search, UserCircle2 } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard/meu-dia", label: "Meu dia", Icon: CalendarCheck2 },
  { href: "/dashboard/buscar", label: "Buscar", Icon: Search },
  { href: "/mensagens", label: "Mensagens", Icon: MessageCircle },
  { href: "/dashboard/perfil", label: "Perfil", Icon: UserCircle2 },
];

export function DashboardQuickNav() {
  const pathname = usePathname();
  return (
    <nav className="dashboard-quick-nav" aria-label="Atalhos rápidos">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link className={active ? "active" : ""} href={href} key={href}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

import Link from "next/link";
import {
  Activity,
  Building2,
  CreditCard,
  Gauge,
  Home,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { requirePlatformOwner } from "@/lib/auth";

const items = [
  { href: "/super-admin", label: "Visão geral", icon: Gauge },
  { href: "/super-admin/escolas", label: "Escolas", icon: Building2 },
  { href: "/super-admin/usuarios", label: "Usuários", icon: Users },
  { href: "/super-admin/planos", label: "Planos & cobrança", icon: CreditCard },
  { href: "/super-admin/configuracoes", label: "Site & sistema", icon: Settings },
  { href: "/super-admin/integracoes", label: "Integrações", icon: Wrench },
  { href: "/super-admin/seguranca", label: "Segurança & auditoria", icon: ShieldCheck },
  { href: "/super-admin/saude", label: "Saúde da plataforma", icon: Activity },
];

export default async function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePlatformOwner();

  return (
    <div className="admin-center-shell">
      <aside className="admin-center-sidebar">
        <Link className="brand" href="/super-admin">
          <span className="logo">CD</span>
          <span>ClassDiary</span>
        </Link>
        <div className="admin-caption">Admin Center</div>
        <nav className="admin-center-nav">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="admin-center-link" href={item.href} key={item.href}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="admin-caption">Ambiente escolar</div>
        <Link className="admin-center-link" href="/dashboard">
          <Home size={18} />
          Abrir dashboard
        </Link>
      </aside>
      <section className="admin-center-content">{children}</section>
    </div>
  );
}

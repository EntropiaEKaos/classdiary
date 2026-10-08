"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Activity,
  Building2,
  CreditCard,
  Gauge,
  Home,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";

const items = [
  { href: "/super-admin", label: "Visão geral", icon: Gauge, exact: true },
  { href: "/super-admin/escolas", label: "Escolas", icon: Building2 },
  { href: "/super-admin/usuarios", label: "Usuários", icon: Users },
  { href: "/super-admin/planos", label: "Planos & cobrança", icon: CreditCard },
  { href: "/super-admin/configuracoes", label: "Site & sistema", icon: Settings },
  { href: "/super-admin/integracoes", label: "Integrações", icon: Wrench },
  { href: "/super-admin/seguranca", label: "Segurança & auditoria", icon: ShieldCheck },
  { href: "/super-admin/saude", label: "Saúde da plataforma", icon: Activity },
];

const quickItems = [
  { href: "/super-admin", label: "Início", icon: Gauge, exact: true },
  { href: "/super-admin/escolas", label: "Escolas", icon: Building2 },
  { href: "/super-admin/usuarios", label: "Usuários", icon: Users },
  { href: "/super-admin/configuracoes", label: "Ajustes", icon: Settings },
];

function isCurrent(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ onNavigate, label }: { onNavigate?: () => void; label: string }) {
  const pathname = usePathname();

  return (
    <nav className="admin-center-nav" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isCurrent(pathname, item.href, item.exact);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`admin-center-link ${active ? "active" : ""}`}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <span className="admin-nav-icon"><Icon size={18} /></span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);


  return (
    <>
      <aside className="admin-center-sidebar">
        <Link className="admin-brand" href="/super-admin">
          <span className="logo">CD</span>
          <span>
            <strong>ClassDiary</strong>
            <small>Admin Center</small>
          </span>
        </Link>
        <div className="admin-caption">Plataforma</div>
        <NavigationLinks label="Navegação principal do Admin Center" />
        <div className="admin-caption">Ambiente escolar</div>
        <Link className="admin-center-link" href="/dashboard">
          <span className="admin-nav-icon"><Home size={18} /></span>
          <span>Abrir dashboard</span>
        </Link>
        <div className="admin-theme-slot"><ThemeToggle showLabel /></div>
        <div className="admin-sidebar-foot">
          <span className="admin-sidebar-dot" />
          <span>Central administrativa</span>
        </div>
      </aside>

      <header className="admin-mobile-topbar">
        <Link className="admin-mobile-brand" href="/super-admin">
          <span className="logo">CD</span>
          <span><strong>ClassDiary</strong><small>Admin Center</small></span>
        </Link>
        <div className="admin-mobile-actions">
          <ThemeToggle />
          <button
          aria-expanded={open}
          aria-label="Abrir menu do Admin Center"
          className="admin-menu-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Menu size={22} />
        </button>
        </div>
      </header>

      {open ? (
        <div className="admin-drawer-layer">
          <button
            aria-label="Fechar menu ao tocar fora"
            className="admin-drawer-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside className="admin-mobile-drawer" aria-label="Menu do Admin Center">
            <div className="admin-drawer-head">
              <div>
                <strong>Admin Center</strong>
                <span>Controle da plataforma</span>
              </div>
              <button aria-label="Fechar menu do Admin Center" className="admin-icon-button" onClick={() => setOpen(false)} type="button">
                <X size={21} />
              </button>
            </div>
            <NavigationLinks label="Menu do Admin Center" onNavigate={() => setOpen(false)} />
            <Link className="admin-center-link admin-dashboard-link" href="/dashboard" onClick={() => setOpen(false)}>
              <span className="admin-nav-icon"><Home size={18} /></span>
              <span>Abrir dashboard escolar</span>
            </Link>
          </aside>
        </div>
      ) : null}

      <nav className="admin-bottom-nav" aria-label="Atalhos do Admin Center">
        {quickItems.map((item) => {
          const Icon = item.icon;
          const active = isCurrent(pathname, item.href, item.exact);
          return (
            <Link className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

import Link from "next/link";
import {
  Activity,
  Building2,
  CreditCard,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platform-settings";
import { AdminPageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const [schools, totalUsers, totalStudents, activeTrials, activeSubscriptions, settings] =
    await Promise.all([
      db.organization.count({ where: { slug: { not: "edusync-platform" } } }),
      db.user.count(),
      db.student.count(),
      db.subscription.count({ where: { status: "TRIAL" } }),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      getPlatformSettings(),
    ]);

  const shortcuts = [
    { title: "Escolas", text: "Tenants, planos, bloqueio e capacidade.", href: "/super-admin/escolas", icon: Building2 },
    { title: "Usuários", text: "Contas globais, papéis e bloqueios.", href: "/super-admin/usuarios", icon: Users },
    { title: "Site & sistema", text: "Home, cadastro público, trial e manutenção.", href: "/super-admin/configuracoes", icon: Settings },
    { title: "Planos & cobrança", text: "Catálogo atual e estado do billing.", href: "/super-admin/planos", icon: CreditCard },
    { title: "Segurança", text: "Sessões, tentativas bloqueadas e auditoria.", href: "/super-admin/seguranca", icon: ShieldCheck },
    { title: "Saúde", text: "Banco, migrations e indicadores operacionais.", href: "/super-admin/saude", icon: Activity },
  ];

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="EduSync SaaS"
        title="Admin Center"
        description="Controle global da plataforma, clientes, segurança e operação."
        backHref="/dashboard"
        backLabel="Dashboard"
      >
        <span className={settings.publicSignupEnabled ? "admin-status ok" : "admin-status warn"}>
          <span className="admin-status-dot" />
          Cadastro {settings.publicSignupEnabled ? "aberto" : "fechado"}
        </span>
      </AdminPageHeader>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card"><span>Escolas</span><strong>{schools}</strong><small>instituições cadastradas</small></article>
        <article className="admin-kpi-card"><span>Usuários</span><strong>{totalUsers}</strong><small>contas na plataforma</small></article>
        <article className="admin-kpi-card"><span>Alunos</span><strong>{totalStudents}</strong><small>registros acadêmicos</small></article>
        <article className="admin-kpi-card"><span>Assinaturas ativas</span><strong>{activeSubscriptions}</strong><small>{activeTrials} trials em andamento</small></article>
      </div>

      <section className="admin-hero-panel">
        <div>
          <span className="admin-eyebrow">Estado comercial</span>
          <h2>Operação pronta para crescer</h2>
          <p>Trial padrão de <strong>{settings.trialDays} dias</strong>. Use os atalhos abaixo para administrar clientes, cobrança e infraestrutura.</p>
        </div>
        <Link className="btn admin-action-button admin-action-primary" href="/super-admin/configuracoes">
          Configurar plataforma
        </Link>
      </section>

      <div className="admin-shortcuts">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="admin-shortcut" href={item.href} key={item.href}>
              <span className="admin-shortcut-icon"><Icon size={20} /></span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
              <span className="admin-shortcut-arrow">→</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

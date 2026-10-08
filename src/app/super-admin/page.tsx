import Link from "next/link";
import { db } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const [schools, totalUsers, totalStudents, activeTrials, activeSubscriptions, settings] =
    await Promise.all([
      db.organization.count({ where: { slug: { not: "classdiary-platform" } } }),
      db.user.count(),
      db.student.count(),
      db.subscription.count({ where: { status: "TRIAL" } }),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      getPlatformSettings(),
    ]);

  const shortcuts = [
    ["Escolas", "Tenants, planos, bloqueio e capacidade.", "/super-admin/escolas"],
    ["Usuários", "Contas globais, papéis e bloqueios.", "/super-admin/usuarios"],
    ["Site & sistema", "Home, cadastro público, trial e manutenção.", "/super-admin/configuracoes"],
    ["Planos & cobrança", "Catálogo atual e estado do billing.", "/super-admin/planos"],
    ["Segurança", "Sessões, tentativas bloqueadas e auditoria.", "/super-admin/seguranca"],
    ["Saúde", "Banco, migrations e indicadores operacionais.", "/super-admin/saude"],
  ];

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div>
          <span className="badge">ClassDiary SaaS</span>
          <h1>Admin Center</h1>
          <p className="muted">Controle global da plataforma, clientes, segurança e operação.</p>
        </div>
        <span className={settings.publicSignupEnabled ? "admin-status ok" : "admin-status warn"}>
          Cadastro público {settings.publicSignupEnabled ? "aberto" : "fechado"}
        </span>
      </div>

      <div className="dashboard-grid">
        <div className="kpi"><span className="muted">Escolas</span><div className="value">{schools}</div></div>
        <div className="kpi"><span className="muted">Usuários</span><div className="value">{totalUsers}</div></div>
        <div className="kpi"><span className="muted">Alunos</span><div className="value">{totalStudents}</div></div>
        <div className="kpi"><span className="muted">Assinaturas ativas</span><div className="value">{activeSubscriptions}</div></div>
      </div>

      <section className="admin-section">
        <h2>Estado comercial</h2>
        <p className="muted">Trial padrão: {settings.trialDays} dias · Trials em andamento: {activeTrials}.</p>
      </section>

      <div className="admin-shortcuts">
        {shortcuts.map(([title, text, href]) => (
          <Link className="admin-shortcut" href={href} key={href}>
            <strong>{title}</strong>
            <span className="muted">{text}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

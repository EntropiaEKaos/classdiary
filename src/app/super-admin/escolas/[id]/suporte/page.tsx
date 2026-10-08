import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requirePlatformOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function SupportViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOwner();
  const { id } = await params;

  const organization = await db.organization.findFirst({
    where: { id, slug: { not: "classdiary-platform" } },
    include: {
      subscription: true,
      _count: {
        select: {
          students: true,
          classGroups: true,
          memberships: true,
          conversations: true,
          notifications: true,
        },
      },
    },
  });

  if (!organization) notFound();

  const [members, audits, incidents] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.auditLog.findMany({
      where: { organizationId: id },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.incident.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="Suporte auditado"
        title={organization.name}
        description="Visão administrativa somente leitura para diagnóstico e atendimento."
        backHref="/super-admin/escolas"
        backLabel="Escolas"
      >
        <span className="admin-status warn"><ShieldCheck size={14}/>Somente leitura</span>
      </AdminPageHeader>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card">
          <span>Alunos</span><strong>{organization._count.students}</strong><small>registros</small>
        </article>
        <article className="admin-kpi-card">
          <span>Turmas</span><strong>{organization._count.classGroups}</strong><small>ativas/históricas</small>
        </article>
        <article className="admin-kpi-card">
          <span>Usuários</span><strong>{organization._count.memberships}</strong><small>vínculos</small>
        </article>
        <article className="admin-kpi-card">
          <span>Plano</span><strong>{organization.subscription?.plan ?? "—"}</strong><small>{organization.subscription?.status ?? "Sem assinatura"}</small>
        </article>
      </div>

      <section className="admin-section">
        <h2>Identidade da escola</h2>
        <p className="muted">
          {organization.slug} · {organization.email ?? "sem e-mail"} · {organization.phone ?? "sem telefone"}
        </p>
      </section>

      <section className="admin-section admin-table-section">
        <div className="admin-section-head"><div><h2>Usuários recentes</h2><p>Somente leitura.</p></div></div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-responsive-table">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th></tr></thead>
            <tbody>
              {members.map((membership) => (
                <tr key={membership.id}>
                  <td data-label="Nome">{membership.user.name}</td>
                  <td data-label="E-mail">{membership.user.email}</td>
                  <td data-label="Papel">{membership.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section admin-table-section">
        <div className="admin-section-head"><div><h2>Auditoria recente</h2><p>Últimas ações registradas.</p></div></div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-responsive-table">
            <thead><tr><th>Quando</th><th>Ação</th><th>Entidade</th><th>Usuário</th></tr></thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id}>
                  <td data-label="Quando">{audit.createdAt.toLocaleString("pt-BR")}</td>
                  <td data-label="Ação">{audit.action}</td>
                  <td data-label="Entidade">{audit.entity}</td>
                  <td data-label="Usuário">{audit.user?.email ?? "Sistema"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {incidents.length ? (
        <section className="admin-section">
          <h2>Incidentes recentes</h2>
          {incidents.map((incident) => (
            <div className="notice" key={incident.id}>
              <strong>{incident.title}</strong>
              <div className="muted">
                {incident.status} · {incident.severity} · {incident.createdAt.toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

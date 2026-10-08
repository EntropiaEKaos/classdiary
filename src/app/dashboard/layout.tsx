import Link from "next/link";
import { switchOrganizationAction } from "@/app/actions/tenant";
import { logoutAction } from "@/app/actions/auth";
import { DashboardNav } from "@/components/dashboard-nav";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ThemeToggle } from "@/components/theme-toggle";
import { DashboardBreadcrumbs } from "@/components/dashboard-breadcrumbs";
import { DashboardQuickNav } from "@/components/dashboard-quick-nav";
import { NotificationsBell } from "@/components/notifications-bell";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const org = await activeOrganization();

  const organizations = user.memberships
    .filter(
      (membership) =>
        membership.organization.active &&
        membership.organization.slug !== "classdiary-platform",
    )
    .map((membership) => membership.organization)
    .filter(
      (organization, index, list) =>
        list.findIndex((item) => item.id === organization.id) === index,
    );

  const [unread, recentNotifications, preference] = org
    ? await Promise.all([
        db.notification.count({
          where: { organizationId: org.id, userId: user.id, readAt: null },
        }),
        db.notification.findMany({
          where: { organizationId: org.id, userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
        db.userPreference.findUnique({ where: { userId: user.id } }),
      ])
    : [0, [], null];

  return (
    <div className={"dashboard-shell " + (preference?.compactMode ? "compact-mode" : "")}>
      <DashboardNav />
      <div className="dashboard-content">
        <header className="dashboard-top">
          <div>
            <strong>{org?.name ?? "ClassDiary"}</strong>
            <span className="muted"> · {user.name}</span>
          </div>

          <div className="top-actions">
            <form className="top-search" action="/dashboard/buscar" method="get">
              <Search size={15}/>
              <input aria-label="Busca global" name="q" placeholder="Buscar..." />
            </form>
            <ThemeToggle />
            <Link className="btn btn-light" href="/agenda">Agenda</Link>
            <Link className="btn btn-light" href="/mensagens">Mensagens</Link>
            <NotificationsBell
              unread={unread}
              recent={recentNotifications.map((item) => ({
                id: item.id,
                title: item.title,
                body: item.body,
                href: item.href,
                createdAt: item.createdAt.toISOString(),
                read: Boolean(item.readAt),
              }))}
            />

            {organizations.length > 1 ? (
              <form action={switchOrganizationAction}>
                <select
                  name="organizationId"
                  defaultValue={org?.id}
                  aria-label="Selecionar escola"
                >
                  {organizations.map((organization) => (
                    <option value={organization.id} key={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-light" type="submit">Trocar</button>
              </form>
            ) : null}

            <form action={logoutAction}>
              <button className="btn btn-light" type="submit">Sair</button>
            </form>
          </div>
        </header>
        <DashboardBreadcrumbs />
        {children}
      </div>
      <DashboardQuickNav />
    </div>
  );
}

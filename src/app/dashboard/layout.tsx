import Link from "next/link";
import { switchOrganizationAction } from "@/app/actions/tenant";
import { logoutAction } from "@/app/actions/auth";
import { DashboardNav } from "@/components/dashboard-nav";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

  const unread = org
    ? await db.notification.count({
        where: {
          organizationId: org.id,
          userId: user.id,
          readAt: null,
        },
      })
    : 0;

  return (
    <div className="dashboard-shell">
      <DashboardNav />
      <div className="dashboard-content">
        <header className="dashboard-top">
          <div>
            <strong>{org?.name ?? "ClassDiary"}</strong>
            <span className="muted"> · {user.name}</span>
          </div>

          <div className="top-actions">
            <Link className="btn btn-light" href="/agenda">Agenda</Link>
            <Link className="btn btn-light" href="/mensagens">Mensagens</Link>
            <Link className="btn btn-light" href="/notificacoes">
              Notificações{unread ? ` (${unread})` : ""}
            </Link>

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
        {children}
      </div>
    </div>
  );
}

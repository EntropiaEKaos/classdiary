import { redirect } from "next/navigation";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type SchoolRole =
  | "SCHOOL_ADMIN"
  | "COORDINATOR"
  | "TEACHER"
  | "SECRETARY"
  | "GUARDIAN"
  | "STUDENT";

export type PermissionAction = "view" | "create" | "update" | "delete";

const roleDefaults: Record<SchoolRole, Record<string, PermissionAction[]>> = {
  SCHOOL_ADMIN: {
    "*": ["view", "create", "update", "delete"],
  },
  COORDINATOR: {
    academic: ["view", "create", "update"],
    reports: ["view"],
    crm: ["view", "create", "update"],
    health: ["view", "create", "update"],
    resources: ["view", "create", "update"],
    maintenance: ["view", "create", "update"],
    procurement: ["view"],
    automation: ["view"],
    messaging: ["view", "create", "update"],
    students: ["view", "create", "update"],
  },
  TEACHER: {
    academic: ["view", "create", "update"],
    messaging: ["view", "create"],
    reports: ["view"],
  },
  SECRETARY: {
    students: ["view", "create", "update"],
    secretary: ["view", "create", "update"],
    finance: ["view", "create", "update"],
    crm: ["view", "create", "update"],
    messaging: ["view", "create"],
    assets: ["view", "create", "update"],
    inventory: ["view", "create", "update"],
    library: ["view", "create", "update"],
    transport: ["view", "create", "update"],
    canteen: ["view", "create", "update"],
    health: ["view"],
    resources: ["view", "create", "update"],
    maintenance: ["view", "create", "update"],
    procurement: ["view", "create", "update"],
    automation: ["view"],
    hr: ["view"],
  },
  GUARDIAN: {
    portal: ["view"],
    messaging: ["view", "create"],
    finance_portal: ["view"],
  },
  STUDENT: {
    portal: ["view"],
    messaging: ["view", "create"],
    finance_portal: ["view"],
  },
};

export async function requireSchoolRole(roles: SchoolRole[]) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) redirect("/onboarding");

  const ok = user.memberships.some(
    (membership) =>
      membership.organizationId === org.id &&
      roles.includes(membership.role as SchoolRole),
  );

  if (!ok) redirect("/dashboard");

  return { user, org };
}

export async function requireModulePermission(
  module: string,
  action: PermissionAction,
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) redirect("/onboarding");

  const memberships = user.memberships.filter(
    (membership) => membership.organizationId === org.id,
  );

  if (!memberships.length) redirect("/dashboard");

  const overrides = await db.permissionOverride.findMany({
    where: {
      organizationId: org.id,
      membershipId: { in: memberships.map((membership) => membership.id) },
      module,
    },
  });

  const overrideByMembership = new Map(
    overrides.map((override) => [override.membershipId, override]),
  );

  const defaultAllowed = memberships.some((membership) => {
    const override = overrideByMembership.get(membership.id);

    if (override) {
      return action === "view"
        ? override.canView
        : action === "create"
          ? override.canCreate
          : action === "update"
            ? override.canUpdate
            : override.canDelete;
    }

    const role = membership.role as SchoolRole;
    const permissions = roleDefaults[role];
    if (!permissions) return false;

    return (
      permissions["*"]?.includes(action) ||
      permissions[module]?.includes(action)
    );
  });

  if (!defaultAllowed) redirect("/dashboard");

  return { user, org };
}

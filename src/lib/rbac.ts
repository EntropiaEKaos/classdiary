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
    students: ["view", "create", "update"],
    reports: ["view"],
    crm: ["view", "create", "update"],
    health: ["view", "create", "update"],
    resources: ["view", "create", "update"],
    maintenance: ["view", "create", "update"],
    procurement: ["view"],
    automation: ["view"],
    quality: ["view", "create", "update"],
    goals: ["view", "create", "update"],
    bi: ["view"],
    assistant: ["view"],
    curriculum: ["view", "create", "update"],
    pedagogy: ["view", "create", "update"],
    assessments: ["view", "create", "update"],
    messaging: ["view", "create", "update"],
  },
  TEACHER: {
    academic: ["view", "create", "update"],
    pedagogy: ["view", "create", "update"],
    assessments: ["view", "create", "update"],
    curriculum: ["view"],
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
    quality: ["view"],
    goals: ["view"],
    bi: ["view"],
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

function actionAllowed(
  role: SchoolRole,
  module: string,
  action: PermissionAction,
) {
  const permissions = roleDefaults[role];
  if (!permissions) return false;

  return (
    permissions["*"]?.includes(action) ||
    permissions[module]?.includes(action) ||
    false
  );
}

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

export async function hasModulePermission(
  module: string,
  action: PermissionAction,
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) return false;

  const memberships = user.memberships.filter(
    (membership) => membership.organizationId === org.id,
  );

  if (!memberships.length) return false;

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

  return memberships.some((membership) => {
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

    return actionAllowed(
      membership.role as SchoolRole,
      module,
      action,
    );
  });
}

export async function getAllowedModules(
  modules: string[],
  action: PermissionAction = "view",
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) return new Set<string>();

  const memberships = user.memberships.filter(
    (membership) => membership.organizationId === org.id,
  );

  if (!memberships.length) return new Set<string>();

  const uniqueModules = [...new Set(modules)];

  const overrides = await db.permissionOverride.findMany({
    where: {
      organizationId: org.id,
      membershipId: { in: memberships.map((membership) => membership.id) },
      module: { in: uniqueModules },
    },
  });

  const overrideMap = new Map(
    overrides.map((override) => [
      override.membershipId + ":" + override.module,
      override,
    ]),
  );

  const allowed = new Set<string>();

  for (const module of uniqueModules) {
    const ok = memberships.some((membership) => {
      const override = overrideMap.get(membership.id + ":" + module);

      if (override) {
        return action === "view"
          ? override.canView
          : action === "create"
            ? override.canCreate
            : action === "update"
              ? override.canUpdate
              : override.canDelete;
      }

      return actionAllowed(
        membership.role as SchoolRole,
        module,
        action,
      );
    });

    if (ok) allowed.add(module);
  }

  return allowed;
}

export async function requireModulePermission(
  module: string,
  action: PermissionAction,
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) redirect("/onboarding");

  if (!(await hasModulePermission(module, action))) {
    redirect("/dashboard");
  }

  return { user, org };
}

import { redirect } from "next/navigation";
import { activeOrganization, requireUser } from "@/lib/auth";

type SchoolRole =
  | "SCHOOL_ADMIN"
  | "COORDINATOR"
  | "TEACHER"
  | "SECRETARY"
  | "GUARDIAN"
  | "STUDENT";

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

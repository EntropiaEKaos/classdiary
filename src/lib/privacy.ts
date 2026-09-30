import { headers } from "next/headers";
import { db } from "@/lib/db";

export async function registerSensitiveAccess(
  organizationId: string,
  userId: string,
  resourceType: string,
  options?: {
    studentId?: string | null;
    resourceId?: string | null;
    purpose?: string | null;
  },
) {
  const h = await headers();

  await db.sensitiveAccessLog.create({
    data: {
      organizationId,
      userId,
      studentId: options?.studentId ?? null,
      resourceType,
      resourceId: options?.resourceId ?? null,
      purpose: options?.purpose ?? null,
      ipAddress:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
}

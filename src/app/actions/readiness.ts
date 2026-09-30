"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { DEFAULT_RELEASE_ITEMS } from "@/lib/release-readiness";

export async function createIncidentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z.object({
    title: z.string().min(3),
    description: z.string().min(5),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    service: z.string().optional(),
  }).parse({
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    severity: String(fd.get("severity") ?? "MEDIUM"),
    service: String(fd.get("service") ?? "").trim(),
  });

  const incident = await db.incident.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      title: p.title,
      description: p.description,
      severity: p.severity,
      service: p.service || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Incident",
      entityId: incident.id,
    },
  });

  revalidatePath("/dashboard/readiness");
}

export async function resolveIncidentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const p = z.object({
    id: z.string().min(1),
    resolution: z.string().min(5),
  }).parse({
    id: String(fd.get("id") ?? ""),
    resolution: String(fd.get("resolution") ?? "").trim(),
  });

  const incident = await db.incident.findFirst({
    where: {
      id: p.id,
      organizationId: org.id,
      status: "OPEN",
    },
  });

  if (!incident) throw new Error("Incidente inválido.");

  await db.incident.update({
    where: { id: incident.id },
    data: {
      status: "RESOLVED",
      resolvedById: user.id,
      resolvedAt: new Date(),
      resolution: p.resolution,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "RESOLVE",
      entity: "Incident",
      entityId: incident.id,
    },
  });

  revalidatePath("/dashboard/readiness");
}

export async function recordBackupVerificationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    backupType: z.enum(["DATABASE", "FILES", "FULL"]),
    provider: z.string().optional(),
    reference: z.string().optional(),
    status: z.enum(["VERIFIED", "FAILED", "PARTIAL"]),
    notes: z.string().optional(),
  }).parse({
    backupType: String(fd.get("backupType") ?? "DATABASE"),
    provider: String(fd.get("provider") ?? "").trim(),
    reference: String(fd.get("reference") ?? "").trim(),
    status: String(fd.get("status") ?? ""),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const record = await db.backupVerification.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      backupType: p.backupType,
      provider: p.provider || null,
      reference: p.reference || null,
      status: p.status,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "VERIFY",
      entity: "BackupVerification",
      entityId: record.id,
    },
  });

  revalidatePath("/dashboard/readiness");
}

export async function recordRestoreDrillAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    environment: z.string().min(2),
    status: z.enum(["SUCCESS", "FAILED", "PARTIAL"]),
    startedAt: z.string().min(1),
    finishedAt: z.string().optional(),
    rtoMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    rpoMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    dataVerified: z.enum(["true", "false"]),
    notes: z.string().optional(),
  }).parse({
    environment: String(fd.get("environment") ?? "").trim(),
    status: String(fd.get("status") ?? ""),
    startedAt: String(fd.get("startedAt") ?? ""),
    finishedAt: String(fd.get("finishedAt") ?? "") || undefined,
    rtoMinutes: fd.get("rtoMinutes") || undefined,
    rpoMinutes: fd.get("rpoMinutes") || undefined,
    dataVerified: String(fd.get("dataVerified") ?? "false"),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const startedAt = new Date(p.startedAt);
  const finishedAt = p.finishedAt ? new Date(p.finishedAt) : null;

  if (
    Number.isNaN(startedAt.getTime()) ||
    (finishedAt && Number.isNaN(finishedAt.getTime())) ||
    (finishedAt && finishedAt < startedAt)
  ) {
    throw new Error("Datas do restore drill inválidas.");
  }

  const drill = await db.restoreDrill.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      environment: p.environment,
      status: p.status,
      startedAt,
      finishedAt,
      rtoMinutes: p.rtoMinutes ?? null,
      rpoMinutes: p.rpoMinutes ?? null,
      dataVerified: p.dataVerified === "true",
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "DRILL",
      entity: "RestoreDrill",
      entityId: drill.id,
    },
  });

  revalidatePath("/dashboard/readiness");
}

export async function upsertReleaseChecklistItemAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    code: z.string().min(2).max(80),
    title: z.string().min(3),
    category: z.enum([
      "DATABASE",
      "SECURITY",
      "OBSERVABILITY",
      "BACKUP",
      "PRIVACY",
      "APPLICATION",
      "OPERATIONS",
    ]),
    required: z.enum(["true", "false"]),
    status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "BLOCKED"]),
    evidence: z.string().optional(),
    notes: z.string().optional(),
  }).parse({
    code: String(fd.get("code") ?? "").trim().toUpperCase(),
    title: String(fd.get("title") ?? "").trim(),
    category: String(fd.get("category") ?? "APPLICATION"),
    required: String(fd.get("required") ?? "true"),
    status: String(fd.get("status") ?? "PENDING"),
    evidence: String(fd.get("evidence") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const item = await db.releaseChecklistItem.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: p.code,
      },
    },
    update: {
      title: p.title,
      category: p.category,
      required: p.required === "true",
      status: p.status,
      evidence: p.evidence || null,
      notes: p.notes || null,
      updatedById: user.id,
    },
    create: {
      organizationId: org.id,
      updatedById: user.id,
      code: p.code,
      title: p.title,
      category: p.category,
      required: p.required === "true",
      status: p.status,
      evidence: p.evidence || null,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "ReleaseChecklistItem",
      entityId: item.id,
      metadata: {
        code: item.code,
        status: item.status,
      },
    },
  });

  revalidatePath("/dashboard/readiness");
}


export async function initializeReleaseChecklistAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  await db.$transaction(
    DEFAULT_RELEASE_ITEMS.map((item) =>
      db.releaseChecklistItem.upsert({
        where: {
          organizationId_code: {
            organizationId: org.id,
            code: item.code,
          },
        },
        update: {
          title: item.title,
          category: item.category,
          required: true,
        },
        create: {
          organizationId: org.id,
          updatedById: user.id,
          code: item.code,
          title: item.title,
          category: item.category,
          required: true,
          status: "PENDING",
        },
      }),
    ),
  );

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "INITIALIZE",
      entity: "ReleaseChecklist",
      metadata: { count: DEFAULT_RELEASE_ITEMS.length },
    },
  });

  revalidatePath("/dashboard/readiness");
}

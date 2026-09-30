"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

async function linkedStudentForUser(
  userId: string,
  organizationId: string,
  studentId?: string | null,
) {
  if (!studentId) return null;

  return db.student.findFirst({
    where: {
      id: studentId,
      organizationId,
      OR: [
        { userLinks: { some: { userId } } },
        { guardians: { some: { userId } } },
      ],
    },
    select: { id: true },
  });
}

export async function recordPrivacyConsentAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    type: z.enum([
      "PRIVACY_NOTICE",
      "IMAGE_USE",
      "COMMUNICATION",
      "RESEARCH",
    ]),
    decision: z.enum(["GRANTED", "WITHDRAWN"]),
    studentId: z.string().optional(),
  }).parse({
    type: String(fd.get("type") ?? ""),
    decision: String(fd.get("decision") ?? ""),
    studentId: String(fd.get("studentId") ?? "") || undefined,
  });

  let studentId: string | null = null;
  if (p.studentId) {
    const linked = await linkedStudentForUser(user.id, org.id, p.studentId);
    if (!linked) throw new Error("Aluno não vinculado ao usuário.");
    studentId = linked.id;
  }

  const existing = await db.privacyConsent.findFirst({
    where: {
      organizationId: org.id,
      userId: user.id,
      studentId,
      type: p.type,
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  if (existing) {
    await db.privacyConsent.update({
      where: { id: existing.id },
      data: {
        status: p.decision,
        grantedAt: p.decision === "GRANTED" ? now : existing.grantedAt,
        withdrawnAt: p.decision === "WITHDRAWN" ? now : null,
      },
    });
  } else {
    await db.privacyConsent.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        studentId,
        type: p.type,
        status: p.decision,
        source: "PORTAL",
        grantedAt: now,
        withdrawnAt: p.decision === "WITHDRAWN" ? now : null,
      },
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: p.decision,
      entity: "PrivacyConsent",
      entityId: existing?.id ?? null,
      metadata: { type: p.type, studentId },
    },
  });

  revalidatePath("/privacidade");
  revalidatePath("/dashboard/privacidade");
}

export async function createDataSubjectRequestAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    type: z.enum([
      "ACCESS",
      "EXPORT",
      "CORRECTION",
      "ANONYMIZATION",
      "DELETION",
    ]),
    studentId: z.string().optional(),
    description: z.string().min(5).max(3000),
  }).parse({
    type: String(fd.get("type") ?? ""),
    studentId: String(fd.get("studentId") ?? "") || undefined,
    description: String(fd.get("description") ?? "").trim(),
  });

  let studentId: string | null = null;
  if (p.studentId) {
    const linked = await linkedStudentForUser(user.id, org.id, p.studentId);
    if (!linked) throw new Error("Aluno não vinculado ao usuário.");
    studentId = linked.id;
  }

  const duplicate = await db.dataSubjectRequest.findFirst({
    where: {
      organizationId: org.id,
      requesterUserId: user.id,
      studentId,
      type: p.type,
      status: { in: ["OPEN", "IN_REVIEW"] },
    },
  });

  if (duplicate) {
    throw new Error("Já existe uma solicitação aberta deste tipo.");
  }

  const request = await db.dataSubjectRequest.create({
    data: {
      organizationId: org.id,
      requesterUserId: user.id,
      studentId,
      type: p.type,
      description: p.description,
    },
  });

  const recipients = await db.membership.findMany({
    where: {
      organizationId: org.id,
      role: { in: ["SCHOOL_ADMIN", "COORDINATOR"] },
    },
    select: { userId: true },
  });

  if (recipients.length) {
    await db.notification.createMany({
      data: recipients.map((recipient) => ({
        organizationId: org.id,
        userId: recipient.userId,
        type: "PRIVACY_REQUEST",
        title: "Nova solicitação de privacidade",
        body: p.type,
        href: "/dashboard/privacidade",
      })),
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "DataSubjectRequest",
      entityId: request.id,
      metadata: { type: p.type, studentId },
    },
  });

  revalidatePath("/privacidade");
  revalidatePath("/dashboard/privacidade");
}

export async function updateDataSubjectRequestAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const p = z.object({
    id: z.string().min(1),
    status: z.enum(["IN_REVIEW", "COMPLETED", "REJECTED"]),
    resolution: z.string().min(3).max(4000),
  }).parse({
    id: String(fd.get("id") ?? ""),
    status: String(fd.get("status") ?? ""),
    resolution: String(fd.get("resolution") ?? "").trim(),
  });

  const request = await db.dataSubjectRequest.findFirst({
    where: {
      id: p.id,
      organizationId: org.id,
      status: { in: ["OPEN", "IN_REVIEW"] },
    },
  });

  if (!request) throw new Error("Solicitação inválida.");

  await db.$transaction([
    db.dataSubjectRequest.update({
      where: { id: request.id },
      data: {
        status: p.status,
        resolution: p.resolution,
        decidedById: user.id,
        decidedAt:
          p.status === "COMPLETED" || p.status === "REJECTED"
            ? new Date()
            : null,
      },
    }),
    db.notification.create({
      data: {
        organizationId: org.id,
        userId: request.requesterUserId,
        type: "PRIVACY_REQUEST_STATUS",
        title: "Atualização da solicitação de privacidade",
        body: p.status + " · " + request.type,
        href: "/privacidade",
      },
    }),
    db.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: p.status,
        entity: "DataSubjectRequest",
        entityId: request.id,
      },
    }),
  ]);

  revalidatePath("/privacidade");
  revalidatePath("/dashboard/privacidade");
}

export async function upsertRetentionPolicyAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    dataCategory: z.enum([
      "ACADEMIC",
      "FINANCIAL",
      "HEALTH",
      "COMMUNICATION",
      "AUDIT",
      "FILES",
    ]),
    retentionDays: z.coerce.number().int().min(30).max(36500),
    action: z.enum(["REVIEW", "ARCHIVE", "ANONYMIZE"]),
    notes: z.string().optional(),
  }).parse({
    dataCategory: String(fd.get("dataCategory") ?? ""),
    retentionDays: fd.get("retentionDays"),
    action: String(fd.get("action") ?? "REVIEW"),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const policy = await db.retentionPolicy.upsert({
    where: {
      organizationId_dataCategory: {
        organizationId: org.id,
        dataCategory: p.dataCategory,
      },
    },
    update: {
      retentionDays: p.retentionDays,
      action: p.action,
      notes: p.notes || null,
      active: true,
    },
    create: {
      organizationId: org.id,
      dataCategory: p.dataCategory,
      retentionDays: p.retentionDays,
      action: p.action,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "RetentionPolicy",
      entityId: policy.id,
    },
  });

  revalidatePath("/dashboard/privacidade");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission, requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function addLeadInteractionAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("crm", "create");

  const p = z.object({
    leadId: z.string().min(1),
    type: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING", "NOTE"]),
    note: z.string().min(2).max(4000),
    nextFollowUpAt: z.string().optional(),
  }).parse({
    leadId: String(fd.get("leadId") ?? ""),
    type: String(fd.get("type") ?? "NOTE"),
    note: String(fd.get("note") ?? "").trim(),
    nextFollowUpAt: String(fd.get("nextFollowUpAt") ?? ""),
  });

  const lead = await db.enrollmentLead.findFirst({
    where: { id: p.leadId, organizationId: org.id },
  });
  if (!lead) throw new Error("Lead inválido.");

  await db.leadInteraction.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      authorId: user.id,
      type: p.type,
      note: p.note,
      nextFollowUpAt: p.nextFollowUpAt
      ? (() => {
          const date = new Date(p.nextFollowUpAt);
          if (Number.isNaN(date.getTime())) throw new Error("Data de follow-up inválida.");
          return date;
        })()
      : null,
    },
  });

  revalidatePath("/dashboard/crm");
}

export async function upsertPermissionOverrideAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    membershipId: z.string().min(1),
    module: z.string().min(1),
    canView: z.boolean(),
    canCreate: z.boolean(),
    canUpdate: z.boolean(),
    canDelete: z.boolean(),
  }).parse({
    membershipId: String(fd.get("membershipId") ?? ""),
    module: String(fd.get("module") ?? ""),
    canView: fd.get("canView") === "on",
    canCreate: fd.get("canCreate") === "on",
    canUpdate: fd.get("canUpdate") === "on",
    canDelete: fd.get("canDelete") === "on",
  });

  const membership = await db.membership.findFirst({
    where: { id: p.membershipId, organizationId: org.id },
  });
  if (!membership) throw new Error("Usuário inválido.");

  const override = await db.permissionOverride.upsert({
    where: {
      membershipId_module: {
        membershipId: membership.id,
        module: p.module,
      },
    },
    update: {
      canView: p.canView,
      canCreate: p.canCreate,
      canUpdate: p.canUpdate,
      canDelete: p.canDelete,
    },
    create: {
      organizationId: org.id,
      membershipId: membership.id,
      module: p.module,
      canView: p.canView,
      canCreate: p.canCreate,
      canUpdate: p.canUpdate,
      canDelete: p.canDelete,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "PermissionOverride",
      entityId: override.id,
      metadata: { module: p.module },
    },
  });

  revalidatePath("/dashboard/permissoes");
}

export async function createDocumentTemplateAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("secretary", "create");

  const p = z.object({
    code: z.string().min(1),
    name: z.string().min(2),
    type: z.string().min(1),
    body: z.string().min(10),
  }).parse({
    code: String(fd.get("code") ?? "").trim().toUpperCase(),
    name: String(fd.get("name") ?? "").trim(),
    type: String(fd.get("type") ?? "").trim(),
    body: String(fd.get("body") ?? "").trim(),
  });

  const template = await db.documentTemplate.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: p.code,
      },
    },
    update: {
      name: p.name,
      type: p.type,
      body: p.body,
      active: true,
    },
    create: {
      organizationId: org.id,
      code: p.code,
      name: p.name,
      type: p.type,
      body: p.body,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "DocumentTemplate",
      entityId: template.id,
    },
  });

  revalidatePath("/dashboard/templates");
}

export async function registerFileAssetAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireUserStorageContext();

  const p = z.object({
    originalName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.coerce.number().int().min(0).max(25 * 1024 * 1024),
    publicUrl: z.string().url(),
    category: z.string().min(1),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
  }).parse({
    originalName: String(fd.get("originalName") ?? "").trim(),
    mimeType: String(fd.get("mimeType") ?? "").trim(),
    sizeBytes: fd.get("sizeBytes"),
    publicUrl: String(fd.get("publicUrl") ?? "").trim(),
    category: String(fd.get("category") ?? "").trim(),
    entityType: String(fd.get("entityType") ?? "").trim(),
    entityId: String(fd.get("entityId") ?? "").trim(),
  });

  const url = new URL(p.publicUrl);
  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
  ) {
    throw new Error("URL de arquivo precisa usar HTTPS.");
  }

  if (p.entityId && !p.entityType) {
    throw new Error("Tipo da entidade é obrigatório quando entityId é informado.");
  }

  if (p.entityType && p.entityId) {
    const validEntity =
      p.entityType === "Student"
        ? await db.student.findFirst({
            where: { id: p.entityId, organizationId: org.id },
            select: { id: true },
          })
        : p.entityType === "AcademicDocument"
          ? await db.academicDocument.findFirst({
              where: { id: p.entityId, organizationId: org.id },
              select: { id: true },
            })
          : p.entityType === "Assignment"
            ? await db.assignment.findFirst({
                where: { id: p.entityId, organizationId: org.id },
                select: { id: true },
              })
            : p.entityType === "Receipt"
              ? await db.receipt.findFirst({
                  where: { id: p.entityId, organizationId: org.id },
                  select: { id: true },
                })
              : null;

    if (!validEntity) {
      throw new Error("Entidade de arquivo inválida para esta escola.");
    }
  }

  const storageKey = org.id + "/" + Date.now() + "-" + p.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");

  await db.fileAsset.create({
    data: {
      organizationId: org.id,
      uploadedById: user.id,
      storageKey,
      originalName: p.originalName,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      publicUrl: p.publicUrl,
      category: p.category,
      entityType: p.entityType || null,
      entityId: p.entityId || null,
    },
  });

  revalidatePath("/dashboard/arquivos");
}

async function requireUserStorageContext() {
  return requireModulePermission("secretary", "create");
}

export async function createCollectionRuleAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("finance", "create");

  const p = z.object({
    name: z.string().min(2),
    daysBeforeDue: z.string().optional(),
    daysAfterDue: z.string().optional(),
    channel: z.enum(["IN_APP", "EMAIL", "WHATSAPP"]),
    messageTemplate: z.string().min(5),
  }).parse({
    name: String(fd.get("name") ?? "").trim(),
    daysBeforeDue: String(fd.get("daysBeforeDue") ?? "").trim(),
    daysAfterDue: String(fd.get("daysAfterDue") ?? "").trim(),
    channel: String(fd.get("channel") ?? "IN_APP"),
    messageTemplate: String(fd.get("messageTemplate") ?? "").trim(),
  });

  const rule = await db.collectionRule.create({
    data: {
      organizationId: org.id,
      name: p.name,
      daysBeforeDue: p.daysBeforeDue ? Math.max(0, Number(p.daysBeforeDue)) : null,
      daysAfterDue: p.daysAfterDue ? Math.max(0, Number(p.daysAfterDue)) : null,
      channel: p.channel,
      messageTemplate: p.messageTemplate,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "CollectionRule",
      entityId: rule.id,
    },
  });

  revalidatePath("/dashboard/financeiro/automacoes");
}

export async function runCollectionAutomationAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("finance", "update");

  const rules = await db.collectionRule.findMany({
    where: { organizationId: org.id, active: true, channel: "IN_APP" },
  });

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: org.id,
      status: { in: ["OPEN", "OVERDUE"] },
    },
    include: {
      student: {
        include: {
          guardians: true,
          userLinks: true,
        },
      },
    },
  });

  const now = new Date();
  let created = 0;

  for (const invoice of invoices) {
    const daysToDue = Math.ceil((invoice.dueAt.getTime() - now.getTime()) / 86_400_000);

    for (const rule of rules) {
      const matchesBefore =
        rule.daysBeforeDue !== null &&
        daysToDue >= 0 &&
        daysToDue === rule.daysBeforeDue;

      const daysLate = Math.max(0, -daysToDue);
      const matchesAfter =
        rule.daysAfterDue !== null &&
        daysLate > 0 &&
        daysLate === rule.daysAfterDue;

      if (!matchesBefore && !matchesAfter) continue;

      const recipients = [
        ...invoice.student.guardians.map((link) => link.userId),
        ...invoice.student.userLinks.map((link) => link.userId),
      ];

      const body = rule.messageTemplate
        .replaceAll("{{student}}", invoice.student.name)
        .replaceAll("{{description}}", invoice.description)
        .replaceAll("{{dueDate}}", invoice.dueAt.toLocaleDateString("pt-BR"));

      for (const userId of [...new Set(recipients)]) {
        await db.notification.create({
          data: {
            organizationId: org.id,
            userId,
            type: "COLLECTION",
            title: rule.name,
            body,
            href: "/financeiro",
          },
        });
        created += 1;
      }
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "RUN",
      entity: "CollectionAutomation",
      metadata: { created },
    },
  });

  revalidatePath("/dashboard/financeiro/automacoes");
}

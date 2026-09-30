"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

const managementRoles = ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"] as const;

export async function createOperationalTaskAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([...managementRoles]);

  const p = z.object({
    assignedToId: z.string().optional(),
    title: z.string().min(3),
    description: z.string().optional(),
    category: z.enum(["GENERAL","ACADEMIC","FINANCE","MAINTENANCE","SECRETARY","HR","FAMILY"]),
    priority: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),
    dueAt: z.string().optional(),
    slaHours: z.coerce.number().int().min(1).max(720).optional(),
  }).parse({
    assignedToId: String(fd.get("assignedToId") ?? "") || undefined,
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    category: String(fd.get("category") ?? "GENERAL"),
    priority: String(fd.get("priority") ?? "MEDIUM"),
    dueAt: String(fd.get("dueAt") ?? "") || undefined,
    slaHours: fd.get("slaHours") || undefined,
  });

  let assignedToId: string | null = null;
  if (p.assignedToId) {
    const member = await db.membership.findFirst({
      where: {
        organizationId: org.id,
        userId: p.assignedToId,
      },
      select: { userId: true },
    });
    if (!member) throw new Error("Responsável inválido para esta escola.");
    assignedToId = member.userId;
  }

  let dueAt: Date | null = null;
  if (p.dueAt) {
    dueAt = new Date(p.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new Error("Prazo inválido.");
  } else if (p.slaHours) {
    dueAt = new Date(Date.now() + p.slaHours * 3600000);
  }

  const task = await db.operationalTask.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      assignedToId,
      title: p.title,
      description: p.description || null,
      category: p.category,
      priority: p.priority,
      dueAt,
      slaHours: p.slaHours ?? null,
    },
  });

  if (assignedToId) {
    await db.notification.create({
      data: {
        organizationId: org.id,
        userId: assignedToId,
        type: "TASK_ASSIGNED",
        title: "Nova tarefa atribuída",
        body: p.title,
        href: "/dashboard/operacao-interna",
      },
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "OperationalTask",
      entityId: task.id,
    },
  });

  revalidatePath("/dashboard/operacao-interna");
}

export async function completeOperationalTaskAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN","COORDINATOR","SECRETARY","TEACHER"
  ]);

  const id = z.string().min(1).parse(String(fd.get("id") ?? ""));
  const task = await db.operationalTask.findFirst({
    where: { id, organizationId: org.id },
  });
  if (!task) throw new Error("Tarefa inválida.");

  const roles = user.memberships
    .filter((m) => m.organizationId === org.id)
    .map((m) => m.role);

  const manager = roles.some((r) =>
    ["SCHOOL_ADMIN","COORDINATOR","SECRETARY"].includes(r),
  );

  if (!manager && task.assignedToId !== user.id) {
    throw new Error("Sem permissão para concluir esta tarefa.");
  }

  await db.operationalTask.update({
    where: { id: task.id },
    data: { status: "DONE", completedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "COMPLETE",
      entity: "OperationalTask",
      entityId: task.id,
    },
  });

  revalidatePath("/dashboard/operacao-interna");
}

export async function createApprovalRequestAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([...managementRoles]);

  const p = z.object({
    type: z.enum(["PURCHASE","DISCOUNT","DOCUMENT","MAINTENANCE","HR","OTHER"]),
    title: z.string().min(3),
    description: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
  }).parse({
    type: String(fd.get("type") ?? "OTHER"),
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    entityType: String(fd.get("entityType") ?? "").trim() || undefined,
    entityId: String(fd.get("entityId") ?? "").trim() || undefined,
  });

  const request = await db.approvalRequest.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      type: p.type,
      title: p.title,
      description: p.description || null,
      entityType: p.entityType || null,
      entityId: p.entityId || null,
    },
  });

  const approvers = await db.membership.findMany({
    where: {
      organizationId: org.id,
      role: { in: ["SCHOOL_ADMIN","COORDINATOR"] },
      NOT: { userId: user.id },
    },
    select: { userId: true },
  });

  if (approvers.length) {
    await db.notification.createMany({
      data: approvers.map((a) => ({
        organizationId: org.id,
        userId: a.userId,
        type: "APPROVAL_PENDING",
        title: "Aprovação pendente",
        body: p.title,
        href: "/dashboard/operacao-interna",
      })),
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "ApprovalRequest",
      entityId: request.id,
    },
  });

  revalidatePath("/dashboard/operacao-interna");
}

export async function decideApprovalRequestAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN","COORDINATOR"
  ]);

  const p = z.object({
    id: z.string().min(1),
    decision: z.enum(["APPROVED","REJECTED"]),
    decisionNote: z.string().optional(),
  }).parse({
    id: String(fd.get("id") ?? ""),
    decision: String(fd.get("decision") ?? ""),
    decisionNote: String(fd.get("decisionNote") ?? "").trim(),
  });

  const request = await db.approvalRequest.findFirst({
    where: {
      id: p.id,
      organizationId: org.id,
      status: "PENDING",
    },
  });
  if (!request) throw new Error("Solicitação inválida.");

  await db.approvalRequest.update({
    where: { id: request.id },
    data: {
      status: p.decision,
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: p.decisionNote || null,
    },
  });

  await db.notification.create({
    data: {
      organizationId: org.id,
      userId: request.createdById,
      type: "APPROVAL_DECIDED",
      title: "Solicitação " + (p.decision === "APPROVED" ? "aprovada" : "rejeitada"),
      body: request.title,
      href: "/dashboard/operacao-interna",
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: p.decision,
      entity: "ApprovalRequest",
      entityId: request.id,
    },
  });

  revalidatePath("/dashboard/operacao-interna");
}

export async function runOperationalEscalationAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN","COORDINATOR"
  ]);

  const now = new Date();
  const overdue = await db.operationalTask.findMany({
    where: {
      organizationId: org.id,
      status: { in: ["OPEN","IN_PROGRESS"] },
      dueAt: { lt: now },
    },
  });

  const managers = await db.membership.findMany({
    where: {
      organizationId: org.id,
      role: { in: ["SCHOOL_ADMIN","COORDINATOR"] },
    },
    select: { userId: true },
  });

  await db.$transaction(async (tx) => {
    for (const task of overdue) {
      const nextLevel = Math.min(3, task.escalationLevel + 1);

      await tx.operationalTask.update({
        where: { id: task.id },
        data: {
          escalationLevel: nextLevel,
          escalatedAt: now,
          priority:
            nextLevel >= 2 && task.priority !== "CRITICAL"
              ? "HIGH"
              : task.priority,
        },
      });

      for (const manager of managers) {
        const title = "SLA vencido · nível " + nextLevel;
        const body = task.title;

        const existing = await tx.notification.findFirst({
          where: {
            organizationId: org.id,
            userId: manager.userId,
            type: "TASK_ESCALATED",
            title,
            body,
            createdAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            },
          },
        });

        if (!existing) {
          await tx.notification.create({
            data: {
              organizationId: org.id,
              userId: manager.userId,
              type: "TASK_ESCALATED",
              title,
              body,
              href: "/dashboard/operacao-interna",
            },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: "ESCALATE",
        entity: "OperationalTask",
        entityId: org.id,
        metadata: { overdueCount: overdue.length },
      },
    });
  });

  revalidatePath("/dashboard/operacao-interna");
}

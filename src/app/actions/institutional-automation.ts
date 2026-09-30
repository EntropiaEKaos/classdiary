"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

function nextOccurrence(
  from: Date,
  cadence: "DAILY" | "WEEKLY" | "MONTHLY",
  weekday?: number | null,
  dayOfMonth?: number | null,
) {
  const next = new Date(from);

  if (cadence === "DAILY") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (cadence === "WEEKLY") {
    const target = weekday ?? next.getDay();
    let delta = (target - next.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    next.setDate(next.getDate() + delta);
    return next;
  }

  const targetDay = Math.min(28, Math.max(1, dayOfMonth ?? next.getDate()));
  next.setMonth(next.getMonth() + 1, 1);
  next.setDate(targetDay);
  return next;
}

export async function createOperationalRoutineAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z.object({
    assignedToId: z.string().optional(),
    name: z.string().min(3),
    description: z.string().optional(),
    category: z.enum([
      "GENERAL",
      "ACADEMIC",
      "FINANCE",
      "MAINTENANCE",
      "SECRETARY",
      "HR",
      "FAMILY",
    ]),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
    dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
    startAt: z.string().min(1),
    slaHours: z.coerce.number().int().min(1).max(720).optional(),
  }).parse({
    assignedToId: String(fd.get("assignedToId") ?? "") || undefined,
    name: String(fd.get("name") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    category: String(fd.get("category") ?? "GENERAL"),
    priority: String(fd.get("priority") ?? "MEDIUM"),
    cadence: String(fd.get("cadence") ?? "DAILY"),
    weekday: fd.get("weekday") || undefined,
    dayOfMonth: fd.get("dayOfMonth") || undefined,
    startAt: String(fd.get("startAt") ?? ""),
    slaHours: fd.get("slaHours") || undefined,
  });

  const startAt = new Date(p.startAt);
  if (Number.isNaN(startAt.getTime())) throw new Error("Data inicial inválida.");

  let assignedToId: string | null = null;
  if (p.assignedToId) {
    const member = await db.membership.findFirst({
      where: {
        organizationId: org.id,
        userId: p.assignedToId,
      },
      select: { userId: true },
    });
    if (!member) throw new Error("Responsável inválido.");
    assignedToId = member.userId;
  }

  const routine = await db.operationalRoutine.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      assignedToId,
      name: p.name,
      description: p.description || null,
      category: p.category,
      priority: p.priority,
      cadence: p.cadence,
      weekday: p.cadence === "WEEKLY" ? p.weekday ?? startAt.getDay() : null,
      dayOfMonth:
        p.cadence === "MONTHLY"
          ? p.dayOfMonth ?? Math.min(28, startAt.getDate())
          : null,
      hour: startAt.getHours(),
      minute: startAt.getMinutes(),
      slaHours: p.slaHours ?? null,
      nextRunAt: startAt,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "OperationalRoutine",
      entityId: routine.id,
    },
  });

  revalidatePath("/dashboard/automacao-institucional");
}

export async function runDueOperationalRoutinesAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const now = new Date();
  const routines = await db.operationalRoutine.findMany({
    where: {
      organizationId: org.id,
      active: true,
      nextRunAt: { lte: now },
    },
    take: 200,
  });

  let created = 0;

  await db.$transaction(async (tx) => {
    for (const routine of routines) {
      const duplicate = await tx.operationalTask.findFirst({
        where: {
          organizationId: org.id,
          relatedType: "OperationalRoutine",
          relatedId: routine.id,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });

      if (!duplicate) {
        await tx.operationalTask.create({
          data: {
            organizationId: org.id,
            createdById: routine.createdById,
            assignedToId: routine.assignedToId,
            title: routine.name,
            description: routine.description,
            category: routine.category,
            priority: routine.priority,
            slaHours: routine.slaHours,
            dueAt: routine.slaHours
              ? new Date(now.getTime() + routine.slaHours * 3600000)
              : null,
            relatedType: "OperationalRoutine",
            relatedId: routine.id,
          },
        });
        created += 1;
      }

      const cadence = routine.cadence as "DAILY" | "WEEKLY" | "MONTHLY";
      const nextRunAt = nextOccurrence(
        routine.nextRunAt,
        cadence,
        routine.weekday,
        routine.dayOfMonth,
      );

      await tx.operationalRoutine.update({
        where: { id: routine.id },
        data: {
          lastRunAt: now,
          nextRunAt,
        },
      });
    }

    await tx.automationExecution.create({
      data: {
        organizationId: org.id,
        startedById: user.id,
        sourceType: "ROUTINE_BATCH",
        status: "SUCCESS",
        matchedCount: routines.length,
        createdCount: created,
        finishedAt: new Date(),
      },
    });
  });

  revalidatePath("/dashboard/automacao-institucional");
  revalidatePath("/dashboard/operacao-interna");
}

type Match = {
  id: string;
  title: string;
  body: string;
  href: string;
  relatedType: string;
};

export async function runInstitutionalRulesAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const now = new Date();
  const rules = await db.automationRule.findMany({
    where: {
      organizationId: org.id,
      active: true,
    },
  });

  const recipients = await db.membership.findMany({
    where: {
      organizationId: org.id,
      role: { in: ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"] },
    },
    select: { userId: true },
  });

  let matched = 0;
  let created = 0;

  for (const rule of rules) {
    const matches: Match[] = [];

    if (rule.event === "TASK_OVERDUE") {
      const rows = await db.operationalTask.findMany({
        where: {
          organizationId: org.id,
          status: { in: ["OPEN", "IN_PROGRESS"] },
          dueAt: { lt: now },
        },
        take: 100,
      });

      matches.push(
        ...rows.map((row) => ({
          id: row.id,
          title: rule.name,
          body: row.title,
          href: "/dashboard/operacao-interna",
          relatedType: "OperationalTask",
        })),
      );
    }

    if (rule.event === "LOW_STOCK") {
      const rows = await db.inventoryItem.findMany({
        where: { organizationId: org.id, active: true },
        take: 500,
      });

      matches.push(
        ...rows
          .filter((row) => Number(row.quantity) <= Number(row.minQuantity))
          .map((row) => ({
            id: row.id,
            title: rule.name,
            body: row.name + ": estoque em " + String(row.quantity),
            href: "/dashboard/estoque",
            relatedType: "InventoryItem",
          })),
      );
    }

    if (rule.event === "APPROVAL_PENDING") {
      const rows = await db.approvalRequest.findMany({
        where: { organizationId: org.id, status: "PENDING" },
        take: 100,
      });

      matches.push(
        ...rows.map((row) => ({
          id: row.id,
          title: rule.name,
          body: row.title,
          href: "/dashboard/operacao-interna",
          relatedType: "ApprovalRequest",
        })),
      );
    }

    if (rule.event === "MAINTENANCE_DUE") {
      const rows = await db.maintenancePlan.findMany({
        where: {
          organizationId: org.id,
          active: true,
          nextDueAt: { lte: new Date(now.getTime() + 7 * 86400000) },
        },
        include: { asset: true },
        take: 100,
      });

      matches.push(
        ...rows.map((row) => ({
          id: row.id,
          title: rule.name,
          body: row.asset.name + ": " + row.name,
          href: "/dashboard/manutencao",
          relatedType: "MaintenancePlan",
        })),
      );
    }

    matched += matches.length;

    const config =
      rule.configuration &&
      typeof rule.configuration === "object" &&
      !Array.isArray(rule.configuration)
        ? (rule.configuration as Record<string, unknown>)
        : {};

    if (rule.action === "CREATE_NOTIFICATION") {
      for (const match of matches) {
        for (const recipient of recipients) {
          const existing = await db.notification.findFirst({
            where: {
              organizationId: org.id,
              userId: recipient.userId,
              type: "AUTOMATION",
              title: match.title,
              body: match.body,
              createdAt: {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              },
            },
          });

          if (!existing) {
            await db.notification.create({
              data: {
                organizationId: org.id,
                userId: recipient.userId,
                type: "AUTOMATION",
                title: match.title,
                body: match.body,
                href: match.href,
              },
            });
            created += 1;
          }
        }
      }
    }

    if (rule.action === "CREATE_TASK") {
      const assignedToId =
        typeof config.assignedToId === "string"
          ? config.assignedToId
          : null;

      if (assignedToId) {
        const member = await db.membership.findFirst({
          where: {
            organizationId: org.id,
            userId: assignedToId,
          },
          select: { userId: true },
        });
        if (!member) throw new Error("Responsável configurado na automação é inválido.");
      }

      const category =
        typeof config.category === "string" ? config.category : "GENERAL";
      const priority =
        typeof config.priority === "string" ? config.priority : "MEDIUM";
      const slaHours =
        typeof config.slaHours === "number"
          ? Math.max(1, Math.min(720, Math.floor(config.slaHours)))
          : null;

      for (const match of matches) {
        const existing = await db.operationalTask.findFirst({
          where: {
            organizationId: org.id,
            status: { in: ["OPEN", "IN_PROGRESS"] },
            relatedType: match.relatedType,
            relatedId: match.id,
          },
        });

        if (!existing) {
          await db.operationalTask.create({
            data: {
              organizationId: org.id,
              createdById: user.id,
              assignedToId,
              title: match.body,
              description: "Criada automaticamente pela regra: " + rule.name,
              category,
              priority,
              slaHours,
              dueAt: slaHours
                ? new Date(now.getTime() + slaHours * 3600000)
                : null,
              relatedType: match.relatedType,
              relatedId: match.id,
            },
          });
          created += 1;
        }
      }
    }

    await db.automationExecution.create({
      data: {
        organizationId: org.id,
        startedById: user.id,
        sourceType: "AUTOMATION_RULE",
        sourceId: rule.id,
        status: "SUCCESS",
        matchedCount: matches.length,
        createdCount: created,
        finishedAt: new Date(),
      },
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "RUN",
      entity: "InstitutionalAutomation",
      entityId: org.id,
      metadata: {
        ruleCount: rules.length,
        matched,
        created,
      },
    },
  });

  revalidatePath("/dashboard/automacao-institucional");
  revalidatePath("/dashboard/operacao-interna");
  revalidatePath("/notificacoes");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function createGuardianMeetingAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const p = z.object({
    studentId: z.string().min(1),
    scheduledAt: z.string().min(1),
    durationMinutes: z.coerce.number().int().min(15).max(180),
    channel: z.enum(["IN_PERSON", "PHONE", "VIDEO", "WHATSAPP"]),
    guardianName: z.string().optional(),
    agenda: z.string().min(5),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    scheduledAt: String(fd.get("scheduledAt") ?? ""),
    durationMinutes: fd.get("durationMinutes") || 30,
    channel: String(fd.get("channel") ?? "IN_PERSON"),
    guardianName: String(fd.get("guardianName") ?? "").trim(),
    agenda: String(fd.get("agenda") ?? "").trim(),
  });

  const scheduledAt = new Date(p.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("Data inválida.");

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id, active: true },
  });
  if (!student) throw new Error("Aluno inválido.");

  const meeting = await db.guardianMeeting.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      createdById: user.id,
      scheduledAt,
      durationMinutes: p.durationMinutes,
      channel: p.channel,
      guardianName: p.guardianName || student.guardianName || null,
      agenda: p.agenda,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "GuardianMeeting",
      entityId: meeting.id,
    },
  });

  revalidatePath("/dashboard/coordenacao");
}

export async function completeGuardianMeetingAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const p = z.object({
    id: z.string().min(1),
    outcome: z.string().min(5),
  }).parse({
    id: String(fd.get("id") ?? ""),
    outcome: String(fd.get("outcome") ?? "").trim(),
  });

  const meeting = await db.guardianMeeting.findFirst({
    where: { id: p.id, organizationId: org.id },
  });
  if (!meeting) throw new Error("Atendimento inválido.");

  await db.guardianMeeting.update({
    where: { id: meeting.id },
    data: { status: "COMPLETED", outcome: p.outcome },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "COMPLETE",
      entity: "GuardianMeeting",
      entityId: meeting.id,
    },
  });

  revalidatePath("/dashboard/coordenacao");
}

export async function createStudentFollowUpPlanAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const p = z.object({
    studentId: z.string().min(1),
    classGroupId: z.string().optional(),
    title: z.string().min(3),
    objective: z.string().min(5),
    actions: z.string().min(5),
    reviewFrequencyDays: z.coerce.number().int().min(1).max(90),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    classGroupId: String(fd.get("classGroupId") ?? "") || undefined,
    title: String(fd.get("title") ?? "").trim(),
    objective: String(fd.get("objective") ?? "").trim(),
    actions: String(fd.get("actions") ?? "").trim(),
    reviewFrequencyDays: fd.get("reviewFrequencyDays") || 7,
  });

  const [student, group] = await Promise.all([
    db.student.findFirst({
      where: { id: p.studentId, organizationId: org.id, active: true },
    }),
    p.classGroupId
      ? db.classGroup.findFirst({
          where: { id: p.classGroupId, organizationId: org.id },
        })
      : Promise.resolve(null),
  ]);

  if (!student) throw new Error("Aluno inválido.");
  if (p.classGroupId && !group) throw new Error("Turma inválida.");

  const nextReviewAt = new Date(Date.now() + p.reviewFrequencyDays * 86400000);

  const plan = await db.studentFollowUpPlan.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      classGroupId: group?.id ?? null,
      createdById: user.id,
      title: p.title,
      objective: p.objective,
      actions: p.actions,
      reviewFrequencyDays: p.reviewFrequencyDays,
      nextReviewAt,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "StudentFollowUpPlan",
      entityId: plan.id,
    },
  });

  revalidatePath("/dashboard/coordenacao");
}

export async function reviewStudentFollowUpPlanAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const id = z.string().min(1).parse(String(fd.get("id") ?? ""));

  const plan = await db.studentFollowUpPlan.findFirst({
    where: { id, organizationId: org.id, status: "ACTIVE" },
  });
  if (!plan) throw new Error("Plano inválido.");

  const now = new Date();
  await db.studentFollowUpPlan.update({
    where: { id: plan.id },
    data: {
      lastReviewedAt: now,
      nextReviewAt: new Date(now.getTime() + plan.reviewFrequencyDays * 86400000),
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "REVIEW",
      entity: "StudentFollowUpPlan",
      entityId: plan.id,
    },
  });

  revalidatePath("/dashboard/coordenacao");
}

export async function runCoordinationAlertsAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const now = new Date();
  const soon = new Date(now.getTime() + 86400000);

  const [plans, meetings, recipients] = await Promise.all([
    db.studentFollowUpPlan.findMany({
      where: {
        organizationId: org.id,
        status: "ACTIVE",
        nextReviewAt: { lte: now },
      },
      include: { student: true },
      take: 100,
    }),
    db.guardianMeeting.findMany({
      where: {
        organizationId: org.id,
        status: "SCHEDULED",
        scheduledAt: { gte: now, lte: soon },
      },
      include: { student: true },
      take: 100,
    }),
    db.membership.findMany({
      where: {
        organizationId: org.id,
        role: { in: ["SCHOOL_ADMIN", "COORDINATOR"] },
      },
      select: { userId: true },
    }),
  ]);

  await db.$transaction(async (tx) => {
    for (const recipient of recipients) {
      for (const plan of plans) {
        const title = "Plano de acompanhamento vencido";
        const body = plan.student.name + " · " + plan.title;

        const exists = await tx.notification.findFirst({
          where: {
            organizationId: org.id,
            userId: recipient.userId,
            type: "FOLLOW_UP_DUE",
            title,
            body,
            createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
          },
        });

        if (!exists) {
          await tx.notification.create({
            data: {
              organizationId: org.id,
              userId: recipient.userId,
              type: "FOLLOW_UP_DUE",
              title,
              body,
              href: "/dashboard/coordenacao",
            },
          });
        }
      }

      for (const meeting of meetings) {
        const title = "Atendimento com responsável nas próximas 24h";
        const body = meeting.student.name + " · " + meeting.scheduledAt.toLocaleString("pt-BR");

        const exists = await tx.notification.findFirst({
          where: {
            organizationId: org.id,
            userId: recipient.userId,
            type: "GUARDIAN_MEETING_DUE",
            title,
            body,
            createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
          },
        });

        if (!exists) {
          await tx.notification.create({
            data: {
              organizationId: org.id,
              userId: recipient.userId,
              type: "GUARDIAN_MEETING_DUE",
              title,
              body,
              href: "/dashboard/coordenacao",
            },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: "RUN",
        entity: "CoordinationAlerts",
        entityId: org.id,
        metadata: {
          overduePlans: plans.length,
          upcomingMeetings: meetings.length,
        },
      },
    });
  });

  revalidatePath("/dashboard/coordenacao");
}

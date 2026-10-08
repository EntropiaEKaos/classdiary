"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { activeOrganization, requireUser } from "@/lib/auth";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

function safeAttachmentUrl(value: string) {
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
  ) {
    throw new Error("O anexo deve usar HTTPS.");
  }
  return url.toString();
}

async function notify(
  organizationId: string,
  userId: string,
  title: string,
  body: string,
  href?: string,
) {
  const preference = await db.userPreference.findUnique({ where: { userId } });
  if (preference && !preference.inAppNotifications) return;

  await db.notification.create({
    data: {
      organizationId,
      userId,
      type: "SYSTEM",
      title,
      body,
      href: href ?? null,
    },
  });
}

export async function createConversationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    recipientId: z.string().min(1),
    subject: z.string().min(2).max(120),
    body: z.string().min(1).max(5000),
    attachmentUrl: z.string().optional(),
  }).parse({
    recipientId: String(fd.get("recipientId") ?? ""),
    subject: String(fd.get("subject") ?? "").trim(),
    body: String(fd.get("body") ?? "").trim(),
    attachmentUrl: String(fd.get("attachmentUrl") ?? "").trim(),
  });

  const recipient = await db.membership.findFirst({
    where: { organizationId: org.id, userId: p.recipientId },
  });
  if (!recipient) throw new Error("Destinatário inválido para esta escola.");

  const conversation = await db.conversation.create({
    data: {
      organizationId: org.id,
      subject: p.subject,
      participants: {
        create: [
          { userId: user.id, lastReadAt: new Date() },
          { userId: p.recipientId },
        ],
      },
      messages: {
        create: { senderId: user.id, body: p.body, attachmentUrl: safeAttachmentUrl(p.attachmentUrl) },
      },
    },
  });

  await notify(
    org.id,
    p.recipientId,
    "Nova mensagem",
    p.subject,
    `/mensagens/${conversation.id}`,
  );

  revalidatePath("/mensagens");
}

export async function replyConversationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    conversationId: z.string().min(1),
    body: z.string().min(1).max(5000),
    attachmentUrl: z.string().optional(),
  }).parse({
    conversationId: String(fd.get("conversationId") ?? ""),
    body: String(fd.get("body") ?? "").trim(),
    attachmentUrl: String(fd.get("attachmentUrl") ?? "").trim(),
  });

  const conversation = await db.conversation.findFirst({
    where: {
      id: p.conversationId,
      organizationId: org.id,
      participants: { some: { userId: user.id } },
    },
    include: { participants: true },
  });
  if (!conversation) throw new Error("Conversa inválida.");

  await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      body: p.body,
      attachmentUrl: safeAttachmentUrl(p.attachmentUrl),
    },
  });

  await db.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  for (const participant of conversation.participants) {
    if (participant.userId !== user.id) {
      await notify(
        org.id,
        participant.userId,
        "Nova resposta",
        "Você recebeu uma nova mensagem.",
        `/mensagens/${conversation.id}`,
      );
    }
  }

  revalidatePath(`/mensagens/${conversation.id}`);
  revalidatePath("/mensagens");
}

export async function markNotificationReadAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const id = z.string().min(1).parse(String(fd.get("notificationId") ?? ""));

  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notificacoes");
}

export async function markAllNotificationsReadAction() {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  await db.notification.updateMany({
    where: { organizationId: org.id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notificacoes");
  revalidatePath("/dashboard");
}

export async function createAbsenceJustificationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    attendanceId: z.string().min(1),
    reason: z.string().min(3).max(2000),
    attachmentUrl: z.string().url().optional().or(z.literal("")),
  }).parse({
    attendanceId: String(fd.get("attendanceId") ?? ""),
    reason: String(fd.get("reason") ?? "").trim(),
    attachmentUrl: String(fd.get("attachmentUrl") ?? "").trim(),
  });

  if (p.attachmentUrl) {
    const url = new URL(p.attachmentUrl);
    if (
      url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
    ) {
      throw new Error("O anexo deve usar HTTPS.");
    }
  }

  const attendance = await db.attendance.findFirst({
    where: {
      id: p.attendanceId,
      status: "ABSENT",
      lesson: { classGroup: { organizationId: org.id } },
    },
    include: { student: { include: { guardians: true, userLinks: true } } },
  });
  if (!attendance) throw new Error("Falta inválida.");

  const canCreate =
    attendance.student.guardians.some((g) => g.userId === user.id) ||
    attendance.student.userLinks.some((l) => l.userId === user.id) ||
    user.memberships.some(
      (m) =>
        m.organizationId === org.id &&
        ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(m.role),
    );

  if (!canCreate) throw new Error("Sem permissão para justificar esta falta.");

  const justification = await db.absenceJustification.upsert({
    where: { attendanceId: attendance.id },
    update: {
      createdById: user.id,
      reason: p.reason,
      attachmentUrl: p.attachmentUrl || null,
      status: "PENDING",
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
    create: {
      organizationId: org.id,
      attendanceId: attendance.id,
      studentId: attendance.studentId,
      createdById: user.id,
      reason: p.reason,
      attachmentUrl: p.attachmentUrl || null,
    },
  });

  const reviewers = await db.membership.findMany({
    where: {
      organizationId: org.id,
      role: { in: ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"] },
    },
  });

  for (const reviewer of reviewers) {
    await notify(
      org.id,
      reviewer.userId,
      "Justificativa de falta pendente",
      attendance.student.name,
      "/dashboard/justificativas",
    );
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "SUBMIT",
      entity: "AbsenceJustification",
      entityId: justification.id,
    },
  });

  revalidatePath("/portal");
  revalidatePath("/aluno");
}

export async function reviewAbsenceJustificationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z.object({
    id: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewNote: z.string().optional(),
  }).parse({
    id: String(fd.get("id") ?? ""),
    decision: String(fd.get("decision") ?? ""),
    reviewNote: String(fd.get("reviewNote") ?? "").trim(),
  });

  const justification = await db.absenceJustification.findFirst({
    where: { id: p.id, organizationId: org.id },
  });
  if (!justification) throw new Error("Justificativa inválida.");

  await db.absenceJustification.update({
    where: { id: justification.id },
    data: {
      status: p.decision,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: p.reviewNote || null,
    },
  });

  if (p.decision === "APPROVED") {
    await db.attendance.update({
      where: { id: justification.attendanceId },
      data: { status: "EXCUSED" },
    });
  }

  await notify(
    org.id,
    justification.createdById,
    p.decision === "APPROVED"
      ? "Justificativa aprovada"
      : "Justificativa recusada",
    p.reviewNote || "A justificativa de falta foi analisada.",
  );

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: p.decision,
      entity: "AbsenceJustification",
      entityId: justification.id,
    },
  });

  revalidatePath("/dashboard/justificativas");
  revalidatePath("/dashboard/frequencia");
}

export async function requestGradeReviewAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    gradeId: z.string().min(1),
    reason: z.string().min(3).max(2000),
  }).parse({
    gradeId: String(fd.get("gradeId") ?? ""),
    reason: String(fd.get("reason") ?? "").trim(),
  });

  const grade = await db.grade.findFirst({
    where: { id: p.gradeId, student: { organizationId: org.id } },
    include: {
      student: { include: { guardians: true, userLinks: true } },
      author: true,
      subject: true,
    },
  });
  if (!grade) throw new Error("Nota inválida.");

  const canRequest =
    grade.student.guardians.some((g) => g.userId === user.id) ||
    grade.student.userLinks.some((l) => l.userId === user.id);

  if (!canRequest) throw new Error("Sem permissão para solicitar revisão desta nota.");

  const pending = await db.gradeReviewRequest.findFirst({
    where: {
      gradeId: grade.id,
      status: "PENDING",
    },
  });
  if (pending) {
    throw new Error("Já existe uma solicitação de revisão pendente para esta nota.");
  }

  await db.gradeReviewRequest.create({
    data: {
      organizationId: org.id,
      gradeId: grade.id,
      studentId: grade.studentId,
      createdById: user.id,
      reason: p.reason,
    },
  });

  await notify(
    org.id,
    grade.authorId,
    "Revisão de nota solicitada",
    `${grade.student.name} · ${grade.subject.name}`,
    "/dashboard/revisoes-notas",
  );

  revalidatePath("/portal");
  revalidatePath("/aluno");

}

export async function reviewGradeRequestAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const p = z.object({
    id: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    response: z.string().optional(),
    proposedValue: z.string().optional(),
  }).parse({
    id: String(fd.get("id") ?? ""),
    decision: String(fd.get("decision") ?? ""),
    response: String(fd.get("response") ?? "").trim(),
    proposedValue: String(fd.get("proposedValue") ?? "").trim(),
  });

  const review = await db.gradeReviewRequest.findFirst({
    where: {
      id: p.id,
      organizationId: org.id,
      status: "PENDING",
    },
    include: { grade: true },
  });
  if (!review) throw new Error("Solicitação inválida.");

  const orgRoles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const isAdminReviewer = orgRoles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
  );

  const isOwningTeacher =
    orgRoles.includes("TEACHER") && review.grade.authorId === user.id;

  if (!isAdminReviewer && !isOwningTeacher) {
    throw new Error("Sem permissão para revisar esta solicitação.");
  }

  let proposedValue: number | null = null;
  if (p.decision === "APPROVED" && p.proposedValue) {
    proposedValue = Number(p.proposedValue);
    if (
      Number.isNaN(proposedValue) ||
      proposedValue < 0 ||
      proposedValue > Number(review.grade.maxValue)
    ) {
      throw new Error("Novo valor de nota inválido.");
    }

    await db.grade.update({
      where: { id: review.gradeId },
      data: { value: proposedValue },
    });
  }

  await db.gradeReviewRequest.update({
    where: { id: review.id },
    data: {
      status: p.decision,
      reviewedById: user.id,
      reviewedAt: new Date(),
      response: p.response || null,
      proposedValue,
    },
  });

  await notify(
    org.id,
    review.createdById,
    p.decision === "APPROVED"
      ? "Revisão de nota aprovada"
      : "Revisão de nota recusada",
    p.response || "A solicitação de revisão foi analisada.",
  );

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: p.decision,
      entity: "GradeReviewRequest",
      entityId: review.id,
    },
  });

  revalidatePath("/dashboard/revisoes-notas");
  revalidatePath("/dashboard/notas");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

export async function createSurveyAction(fd: FormData) {
  const { user, org } = await requireModulePermission("quality", "create");

  const p = z.object({
    title: z.string().min(2),
    audience: z.enum(["ALL", "STUDENTS", "GUARDIANS", "STAFF"]),
    type: z.enum(["NPS", "SATISFACTION", "CUSTOM"]),
    question: z.string().min(3),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  }).parse({
    title: String(fd.get("title") ?? "").trim(),
    audience: String(fd.get("audience") ?? "ALL"),
    type: String(fd.get("type") ?? "NPS"),
    question: String(fd.get("question") ?? "").trim(),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
  });

  const startsAt = p.startsAt ? new Date(p.startsAt) : null;
  const endsAt = p.endsAt ? new Date(p.endsAt) : null;

  if (
    (startsAt && Number.isNaN(startsAt.getTime())) ||
    (endsAt && Number.isNaN(endsAt.getTime())) ||
    (startsAt && endsAt && endsAt <= startsAt)
  ) {
    throw new Error("Período da pesquisa inválido.");
  }

  const survey = await db.survey.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      title: p.title,
      audience: p.audience,
      type: p.type,
      startsAt,
      endsAt,
      questions: {
        create: {
          prompt: p.question,
          type: "SCORE",
          position: 1,
        },
      },
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Survey",
      entityId: survey.id,
    },
  });

  revalidatePath("/dashboard/qualidade");
}

export async function submitSurveyResponseAction(fd: FormData) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    surveyId: z.string().min(1),
    questionId: z.string().min(1),
    score: z.coerce.number().int().min(0).max(10),
    comment: z.string().optional(),
  }).parse({
    surveyId: String(fd.get("surveyId") ?? ""),
    questionId: String(fd.get("questionId") ?? ""),
    score: fd.get("score"),
    comment: String(fd.get("comment") ?? "").trim(),
  });

  const survey = await db.survey.findFirst({
    where: {
      id: p.surveyId,
      organizationId: org.id,
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
    },
    include: { questions: true },
  });
  if (!survey || !survey.questions.some((q) => q.id === p.questionId)) {
    throw new Error("Pesquisa inválida.");
  }

  const orgRoles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const isStudent = orgRoles.includes("STUDENT");
  const isGuardian = orgRoles.includes("GUARDIAN");
  const isStaff = orgRoles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR", "TEACHER", "SECRETARY"].includes(role),
  );

  const audienceAllowed =
    survey.audience === "ALL" ||
    (survey.audience === "STUDENTS" && isStudent) ||
    (survey.audience === "GUARDIANS" && isGuardian) ||
    (survey.audience === "STAFF" && isStaff);

  if (!audienceAllowed) {
    throw new Error("Esta pesquisa não está disponível para o seu perfil.");
  }

  const existing = await db.surveyResponse.findFirst({
    where: {
      surveyId: survey.id,
      respondentRef: user.id,
    },
  });
  if (existing) throw new Error("Você já respondeu esta pesquisa.");

  await db.surveyResponse.create({
    data: {
      organizationId: org.id,
      surveyId: survey.id,
      respondentType: "USER",
      respondentRef: user.id,
      score: p.score,
      comment: p.comment || null,
      answers: {
        create: {
          questionId: p.questionId,
          value: String(p.score),
        },
      },
    },
  });

  revalidatePath("/portal");
  revalidatePath("/aluno");
}

export async function createPedagogicalGoalAction(fd: FormData) {
  const { user, org } = await requireModulePermission("goals", "create");

  const p = z.object({
    scopeType: z.enum(["SCHOOL", "CLASS", "TEACHER"]),
    scopeId: z.string().optional(),
    title: z.string().min(2),
    metric: z.enum(["AVERAGE_GRADE", "ATTENDANCE", "LESSONS", "ASSIGNMENT_DELIVERY"]),
    targetValue: z.coerce.number().min(0),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    notes: z.string().optional(),
  }).parse({
    scopeType: String(fd.get("scopeType") ?? "SCHOOL"),
    scopeId: String(fd.get("scopeId") ?? "") || undefined,
    title: String(fd.get("title") ?? "").trim(),
    metric: String(fd.get("metric") ?? ""),
    targetValue: fd.get("targetValue"),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const startsAt = new Date(p.startsAt);
  const endsAt = new Date(p.endsAt);

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    throw new Error("Período da meta inválido.");
  }

  let scopeId: string | null = null;

  if (p.scopeType === "CLASS") {
    if (!p.scopeId) throw new Error("Turma obrigatória para esta meta.");
    const group = await db.classGroup.findFirst({
      where: { id: p.scopeId, organizationId: org.id },
      select: { id: true },
    });
    if (!group) throw new Error("Turma inválida.");
    scopeId = group.id;
  } else if (p.scopeType === "TEACHER") {
    if (!p.scopeId) throw new Error("Professor obrigatório para esta meta.");
    const teacher = await db.membership.findFirst({
      where: {
        organizationId: org.id,
        userId: p.scopeId,
        role: "TEACHER",
      },
      select: { userId: true },
    });
    if (!teacher) throw new Error("Professor inválido.");
    scopeId = teacher.userId;
  }

  await db.pedagogicalGoal.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      scopeType: p.scopeType,
      scopeId,
      title: p.title,
      metric: p.metric,
      targetValue: p.targetValue,
      startsAt,
      endsAt,
      notes: p.notes || null,
    },
  });

  revalidatePath("/dashboard/metas");
}

async function metricValue(
  orgId: string,
  metric: string,
  scopeType: string,
  scopeId: string | null,
) {
  if (metric === "LESSONS") {
    return db.lesson.count({
      where:
        scopeType === "CLASS" && scopeId
          ? { classGroupId: scopeId, classGroup: { organizationId: orgId } }
          : scopeType === "TEACHER" && scopeId
            ? { teacherId: scopeId, classGroup: { organizationId: orgId } }
            : { classGroup: { organizationId: orgId } },
    });
  }

  const students = await db.student.findMany({
    where:
      scopeType === "CLASS" && scopeId
        ? {
            organizationId: orgId,
            enrollments: { some: { classGroupId: scopeId, active: true } },
          }
        : { organizationId: orgId, active: true },
    include: { grades: true, attendance: true, submissions: true },
  });

  if (metric === "AVERAGE_GRADE") {
    const values = students.flatMap((student) =>
      student.grades.map((grade) =>
        (Number(grade.value) / Number(grade.maxValue)) * 10,
      ),
    );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  if (metric === "ATTENDANCE") {
    const entries = students.flatMap((student) => student.attendance);
    if (!entries.length) return 100;
    const present = entries.filter((entry) =>
      ["PRESENT", "LATE", "EXCUSED"].includes(entry.status),
    ).length;
    return (present / entries.length) * 100;
  }

  if (metric === "ASSIGNMENT_DELIVERY") {
    const activeStudents = students.length;
    if (!activeStudents) return 0;

    const assignmentCount = await db.assignment.count({
      where:
        scopeType === "CLASS" && scopeId
          ? { organizationId: orgId, classGroupId: scopeId }
          : { organizationId: orgId },
    });

    if (!assignmentCount) return 100;
    const delivered = students.reduce(
      (sum, student) => sum + student.submissions.length,
      0,
    );
    return (delivered / (assignmentCount * activeStudents)) * 100;
  }

  return 0;
}

export async function recalculateGoalsAction() {
  const { org } = await requireModulePermission("goals", "update");
  const goals = await db.pedagogicalGoal.findMany({
    where: { organizationId: org.id, status: "ACTIVE" },
  });

  for (const goal of goals) {
    const value = await metricValue(
      org.id,
      goal.metric,
      goal.scopeType,
      goal.scopeId,
    );

    await db.pedagogicalGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: value,
        status: value >= Number(goal.targetValue) ? "ACHIEVED" : "ACTIVE",
      },
    });
  }

  revalidatePath("/dashboard/metas");
}

export async function askAdministrativeAssistantAction(fd: FormData) {
  const { user, org } = await requireModulePermission("assistant", "view");
  const question = z.string().min(3).max(500).parse(
    String(fd.get("question") ?? "").trim(),
  );

  const normalized = question.toLowerCase();
  let intent = "OVERVIEW";
  let answer = "";

  if (normalized.includes("inadimpl") || normalized.includes("finance")) {
    intent = "FINANCE";
    const [open, overdue, received] = await Promise.all([
      db.invoice.count({ where: { organizationId: org.id, status: "OPEN" } }),
      db.invoice.count({ where: { organizationId: org.id, status: "OVERDUE" } }),
      db.payment.aggregate({
        where: { organizationId: org.id },
        _sum: { amount: true },
      }),
    ]);
    answer =
      `Financeiro: ${open} cobranças abertas, ${overdue} em atraso e R$ ${Number(received._sum.amount ?? 0).toFixed(2)} recebidos no histórico registrado.`;
  } else if (
    normalized.includes("nota") ||
    normalized.includes("frequ") ||
    normalized.includes("acad")
  ) {
    intent = "ACADEMIC";
    const students = await db.student.findMany({
      where: { organizationId: org.id, active: true },
      include: { grades: true, attendance: true },
    });
    const gradeValues = students.flatMap((student) =>
      student.grades.map((grade) =>
        (Number(grade.value) / Number(grade.maxValue)) * 10,
      ),
    );
    const entries = students.flatMap((student) => student.attendance);
    const attendance = entries.length
      ? (entries.filter((entry) =>
          ["PRESENT", "LATE", "EXCUSED"].includes(entry.status),
        ).length /
          entries.length) *
        100
      : 100;
    answer =
      `Acadêmico: ${students.length} alunos ativos, média geral ${(gradeValues.length ? gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length : 0).toFixed(2)} e frequência média ${attendance.toFixed(1)}%.`;
  } else if (normalized.includes("lead") || normalized.includes("matrícul")) {
    intent = "CRM";
    const [leads, converted] = await Promise.all([
      db.enrollmentLead.count({ where: { organizationId: org.id } }),
      db.enrollmentLead.count({
        where: { organizationId: org.id, status: "CONVERTED" },
      }),
    ]);
    answer =
      `Captação: ${leads} leads registrados e ${converted} convertidos em alunos. Taxa observada: ${leads ? ((converted / leads) * 100).toFixed(1) : "0.0"}%.`;
  } else {
    const [students, employees, leads, overdue] = await Promise.all([
      db.student.count({ where: { organizationId: org.id, active: true } }),
      db.employee.count({ where: { organizationId: org.id, active: true } }),
      db.enrollmentLead.count({
        where: {
          organizationId: org.id,
          status: { in: ["PRE_ENROLLMENT", "WAITLIST", "APPROVED"] },
        },
      }),
      db.invoice.count({ where: { organizationId: org.id, status: "OVERDUE" } }),
    ]);
    answer =
      `Resumo atual: ${students} alunos ativos, ${employees} colaboradores, ${leads} leads em andamento e ${overdue} cobranças em atraso.`;
  }

  await db.assistantQueryLog.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      question,
      intent,
      responseSummary: answer,
    },
  });

  redirect(
    "/dashboard/assistente?q=" +
      encodeURIComponent(question) +
      "&a=" +
      encodeURIComponent(answer),
  );
}

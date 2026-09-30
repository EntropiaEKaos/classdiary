"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

async function requireTeacherAssessmentScope(
  userId: string,
  orgId: string,
  classGroupId: string,
  subjectId: string,
) {
  const membership = await db.membership.findFirst({
    where: { organizationId: orgId, userId },
  });
  if (!membership) throw new Error("Usuário sem vínculo com a escola.");

  if (["SCHOOL_ADMIN", "COORDINATOR"].includes(membership.role)) return;

  if (membership.role === "TEACHER") {
    const assignment = await db.classSubject.findFirst({
      where: {
        classGroupId,
        subjectId,
        teacherId: userId,
        classGroup: { organizationId: orgId },
      },
    });
    if (!assignment) throw new Error("Professor sem vínculo com esta turma/disciplina.");
    return;
  }

  throw new Error("Sem permissão para gerenciar avaliações.");
}


async function postAttemptToGradebook(attemptId: string) {
  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      organization: true,
      exam: {
        include: {
          academicPeriod: true,
          questions: true,
          recoveryTargetCases: true,
        },
      },
      grade: true,
    },
  });

  if (!attempt || attempt.status !== "GRADED") return;

  const maxValue = attempt.exam.questions.reduce(
    (sum, question) => sum + Number(question.points),
    0,
  );
  if (maxValue <= 0) return;

  const normalized10 = (Number(attempt.finalScore) / maxValue) * 10;
  const percent = (Number(attempt.finalScore) / maxValue) * 100;

  const recoveryCase = attempt.exam.recoveryTargetCases.find(
    (item) => item.studentId === attempt.studentId && item.status !== "COMPLETED",
  );

  if (recoveryCase) {
    if (!attempt.exam.academicPeriod) return;

    await db.$transaction(async (tx) => {
      const existing = await tx.recoveryGrade.findFirst({
        where: {
          studentId: attempt.studentId,
          subjectId: attempt.exam.subjectId,
          period: attempt.exam.academicPeriod!.name,
          notes: { contains: recoveryCase.id },
        },
      });

      if (!existing) {
        await tx.recoveryGrade.create({
          data: {
            studentId: attempt.studentId,
            subjectId: attempt.exam.subjectId,
            schoolYearId: attempt.exam.academicPeriod!.schoolYearId,
            classGroupId: attempt.exam.classGroupId,
            academicPeriodId: attempt.exam.academicPeriod!.id,
            period: attempt.exam.academicPeriod!.name,
            value: normalized10,
            notes: `Recuperação automática do caso ${recoveryCase.id}`,
          },
        });
      }

      await tx.examRecoveryCase.update({
        where: { id: recoveryCase.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    });

    revalidatePath("/dashboard/recuperacoes-avaliacoes");
    revalidatePath("/dashboard/boletins");
    return;
  }

  if (!attempt.exam.postToGradebook) return;
  if (!attempt.exam.academicPeriod) return;

  await db.$transaction(async (tx) => {
    const fresh = await tx.examAttempt.findUnique({
      where: { id: attempt.id },
      include: { grade: true, recoveryCase: true },
    });
    if (!fresh || fresh.grade || fresh.gradePostedAt) return;

    await tx.grade.create({
      data: {
        studentId: attempt.studentId,
        subjectId: attempt.exam.subjectId,
        authorId: attempt.exam.authorId,
        schoolYearId: attempt.exam.academicPeriod!.schoolYearId,
        classGroupId: attempt.exam.classGroupId,
        academicPeriodId: attempt.exam.academicPeriod!.id,
        period: attempt.exam.academicPeriod!.name,
        label: attempt.exam.gradeLabel || attempt.exam.title,
        value: attempt.finalScore,
        maxValue,
        weight: attempt.exam.gradeWeight,
        notes: "Lançada automaticamente a partir da prova online.",
        examAttemptId: attempt.id,
      },
    });

    await tx.examAttempt.update({
      where: { id: attempt.id },
      data: { gradePostedAt: new Date() },
    });

    if (
      normalized10 < Number(attempt.organization.passingGrade) &&
      !fresh.recoveryCase
    ) {
      await tx.examRecoveryCase.create({
        data: {
          organizationId: attempt.organizationId,
          studentId: attempt.studentId,
          originalExamId: attempt.examId,
          originalAttemptId: attempt.id,
          threshold: Number(attempt.organization.passingGrade) * 10,
          originalPercent: percent,
        },
      });
    }
  });

  revalidatePath("/dashboard/notas");
  revalidatePath("/dashboard/boletins");
  revalidatePath("/dashboard/recuperacoes-avaliacoes");
}

export async function createQuestionBankItemAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "create");

  const p = z.object({
    subjectId: z.string().optional(),
    competencyId: z.string().optional(),
    type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT", "ESSAY"]),
    prompt: z.string().min(3),
    explanation: z.string().optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    options: z.string().optional(),
    correctAnswer: z.string().optional(),
    tags: z.string().optional(),
    maxScore: z.coerce.number().positive(),
  }).parse({
    subjectId: String(fd.get("subjectId") ?? "") || undefined,
    competencyId: String(fd.get("competencyId") ?? "") || undefined,
    type: String(fd.get("type") ?? "MULTIPLE_CHOICE"),
    prompt: String(fd.get("prompt") ?? "").trim(),
    explanation: String(fd.get("explanation") ?? "").trim(),
    difficulty: String(fd.get("difficulty") ?? "MEDIUM"),
    options: String(fd.get("options") ?? "").trim(),
    correctAnswer: String(fd.get("correctAnswer") ?? "").trim(),
    tags: String(fd.get("tags") ?? "").trim(),
    maxScore: fd.get("maxScore") || 1,
  });

  let options: string[] | null = null;
  if (p.type === "MULTIPLE_CHOICE") {
    options = p.options
      ? p.options.split("\n").map((x) => x.trim()).filter(Boolean)
      : [];
    if (options.length < 2) throw new Error("Questão objetiva precisa de pelo menos duas opções.");
    if (!p.correctAnswer) throw new Error("Informe a resposta correta.");
  }

  if (p.type === "TRUE_FALSE" && !["TRUE", "FALSE"].includes(p.correctAnswer ?? "")) {
    throw new Error("Resposta correta deve ser TRUE ou FALSE.");
  }

  if (p.subjectId) {
    const subject = await db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    });
    if (!subject) throw new Error("Disciplina inválida.");
  }

  if (p.competencyId) {
    const competency = await db.curriculumCompetency.findFirst({
      where: { id: p.competencyId, organizationId: org.id },
    });
    if (!competency) throw new Error("Competência inválida.");
  }

  await db.questionBankItem.create({
    data: {
      organizationId: org.id,
      subjectId: p.subjectId || null,
      authorId: user.id,
      type: p.type,
      prompt: p.prompt,
      explanation: p.explanation || null,
      difficulty: p.difficulty,
      options: options ?? undefined,
      correctAnswer: p.correctAnswer || null,
      tags: p.tags ? p.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
      maxScore: p.maxScore,
      ...(p.competencyId
        ? {
            competencies: {
              create: { competencyId: p.competencyId },
            },
          }
        : {}),
    },
  });

  revalidatePath("/dashboard/banco-questoes");
}

export async function createExamAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "create");

  const p = z.object({
    classGroupId: z.string().min(1),
    subjectId: z.string().min(1),
    title: z.string().min(2),
    description: z.string().optional(),
    type: z.enum(["EXAM", "QUIZ", "SIMULATION"]),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    durationMinutes: z.coerce.number().int().min(1).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(10),
    shuffleQuestions: z.boolean(),
    academicPeriodId: z.string().optional(),
    postToGradebook: z.boolean(),
    gradeLabel: z.string().optional(),
    gradeWeight: z.coerce.number().positive(),
  }).parse({
    classGroupId: String(fd.get("classGroupId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? ""),
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    type: String(fd.get("type") ?? "EXAM"),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
    durationMinutes: fd.get("durationMinutes") || undefined,
    maxAttempts: fd.get("maxAttempts") || 1,
    shuffleQuestions: fd.get("shuffleQuestions") === "on",
    academicPeriodId: String(fd.get("academicPeriodId") ?? "") || undefined,
    postToGradebook: fd.get("postToGradebook") === "on",
    gradeLabel: String(fd.get("gradeLabel") ?? "").trim(),
    gradeWeight: fd.get("gradeWeight") || 1,
  });

  const [group, subject] = await Promise.all([
    db.classGroup.findFirst({
      where: { id: p.classGroupId, organizationId: org.id },
    }),
    db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    }),
  ]);

  if (!group || !subject) throw new Error("Turma ou disciplina inválida.");

  if (p.academicPeriodId) {
    const period = await db.academicPeriod.findFirst({
      where: { id: p.academicPeriodId, organizationId: org.id, schoolYearId: group.schoolYearId },
    });
    if (!period) throw new Error("Período acadêmico inválido para a turma.");
  }

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    group.id,
    subject.id,
  );

  await db.exam.create({
    data: {
      organizationId: org.id,
      classGroupId: group.id,
      subjectId: subject.id,
      authorId: user.id,
      academicPeriodId: p.academicPeriodId || null,
      title: p.title,
      description: p.description || null,
      type: p.type,
      startsAt: p.startsAt ? new Date(p.startsAt) : null,
      endsAt: p.endsAt ? new Date(p.endsAt) : null,
      durationMinutes: p.durationMinutes ?? null,
      maxAttempts: p.maxAttempts,
      shuffleQuestions: p.shuffleQuestions,
      postToGradebook: p.postToGradebook,
      gradeLabel: p.gradeLabel || null,
      gradeWeight: p.gradeWeight,
    },
  });

  revalidatePath("/dashboard/provas");
}

export async function addQuestionToExamAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");

  const p = z.object({
    examId: z.string().min(1),
    questionId: z.string().min(1),
    points: z.coerce.number().positive(),
  }).parse({
    examId: String(fd.get("examId") ?? ""),
    questionId: String(fd.get("questionId") ?? ""),
    points: fd.get("points") || 1,
  });

  const exam = await db.exam.findFirst({
    where: { id: p.examId, organizationId: org.id },
  });
  const question = await db.questionBankItem.findFirst({
    where: { id: p.questionId, organizationId: org.id, active: true },
    include: { competencies: true },
  });
  if (!exam || !question) throw new Error("Prova ou questão inválida.");

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    exam.classGroupId,
    exam.subjectId,
  );

  const last = await db.examQuestion.findFirst({
    where: { examId: exam.id },
    orderBy: { position: "desc" },
  });

  await db.examQuestion.create({
    data: {
      examId: exam.id,
      questionId: question.id,
      position: (last?.position ?? 0) + 1,
      points: p.points,
      competencies: {
        create: question.competencies.map((link) => ({
          competencyId: link.competencyId,
        })),
      },
    },
  });

  revalidatePath("/dashboard/provas");
}

export async function generateExamFromCompetencyAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "create");

  const p = z.object({
    classGroupId: z.string().min(1),
    subjectId: z.string().min(1),
    competencyId: z.string().min(1),
    title: z.string().min(2),
    questionCount: z.coerce.number().int().min(1).max(50),
  }).parse({
    classGroupId: String(fd.get("classGroupId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? ""),
    competencyId: String(fd.get("competencyId") ?? ""),
    title: String(fd.get("title") ?? "").trim(),
    questionCount: fd.get("questionCount") || 5,
  });

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    p.classGroupId,
    p.subjectId,
  );

  const questions = await db.questionBankItem.findMany({
    where: {
      organizationId: org.id,
      active: true,
      OR: [{ subjectId: p.subjectId }, { subjectId: null }],
      competencies: { some: { competencyId: p.competencyId } },
    },
    include: { competencies: true },
    take: p.questionCount,
    orderBy: { createdAt: "desc" },
  });

  if (!questions.length) {
    throw new Error("Nenhuma questão encontrada para essa competência.");
  }

  await db.exam.create({
    data: {
      organizationId: org.id,
      classGroupId: p.classGroupId,
      subjectId: p.subjectId,
      authorId: user.id,
      title: p.title,
      type: "SIMULATION",
      questions: {
        create: questions.map((question, index) => ({
          questionId: question.id,
          position: index + 1,
          points: question.maxScore,
          competencies: {
            create: question.competencies.map((link) => ({
              competencyId: link.competencyId,
            })),
          },
        })),
      },
    },
  });

  revalidatePath("/dashboard/provas");
}

export async function publishExamAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");
  const id = z.string().min(1).parse(String(fd.get("examId") ?? ""));

  const exam = await db.exam.findFirst({
    where: { id, organizationId: org.id },
    include: { questions: true },
  });
  if (!exam) throw new Error("Prova inválida.");

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    exam.classGroupId,
    exam.subjectId,
  );

  if (!exam.questions.length) throw new Error("Adicione ao menos uma questão.");

  await db.exam.update({
    where: { id: exam.id },
    data: { published: true },
  });

  revalidatePath("/dashboard/provas");
}

export async function startExamAttemptAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const examId = z.string().min(1).parse(String(fd.get("examId") ?? ""));

  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
    include: {
      student: {
        include: {
          enrollments: { where: { active: true } },
        },
      },
    },
  });
  if (!link) throw new Error("Aluno não vinculado.");

  const exam = await db.exam.findFirst({
    where: {
      id: examId,
      organizationId: org.id,
      published: true,
      classGroupId: {
        in: link.student.enrollments.map((e) => e.classGroupId),
      },
      OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
    },
    include: {
      questions: { orderBy: { position: "asc" } },
      attemptAllowances: {
        where: {
          studentId: link.studentId,
          active: true,
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
      },
    },
  });
  if (!exam) throw new Error("Prova indisponível.");

  const attempts = await db.examAttempt.count({
    where: { examId: exam.id, studentId: link.studentId },
  });

  const extraAttempts = exam.attemptAllowances.reduce(
    (sum, allowance) => sum + allowance.extraAttempts,
    0,
  );
  const allowedAttempts = (exam.restrictedAccess ? 0 : exam.maxAttempts) + extraAttempts;

  if (allowedAttempts <= 0) {
    throw new Error("Esta avaliação exige autorização individual.");
  }

  if (attempts >= allowedAttempts) {
    throw new Error("Limite de tentativas atingido.");
  }

  const variantCodes = ["A", "B", "C"];
  const variantCode = variantCodes[attempts % variantCodes.length];
  let order = exam.questions.map((question) => question.id);

  if (variantCode === "B" && order.length > 1) {
    order = [...order.slice(1), order[0]];
  } else if (variantCode === "C" && order.length > 2) {
    order = [...order.slice(2), ...order.slice(0, 2)];
  }

  if (exam.shuffleQuestions) {
    order = [...order].sort(() => Math.random() - 0.5);
  }

  const attempt = await db.examAttempt.create({
    data: {
      organizationId: org.id,
      examId: exam.id,
      studentId: link.studentId,
      variantCode,
      questionOrder: order,
    },
  });

  redirect("/provas/" + exam.id + "/tentativa/" + attempt.id);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function submitExamAttemptAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const attemptId = z.string().min(1).parse(String(fd.get("attemptId") ?? ""));

  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
  });
  if (!link) throw new Error("Aluno não vinculado.");

  const attempt = await db.examAttempt.findFirst({
    where: {
      id: attemptId,
      organizationId: org.id,
      studentId: link.studentId,
      status: "IN_PROGRESS",
    },
    include: {
      exam: {
        include: {
          questions: {
            include: { question: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });
  if (!attempt) throw new Error("Tentativa inválida.");

  if (
    attempt.exam.durationMinutes &&
    Date.now() - attempt.startedAt.getTime() >
      attempt.exam.durationMinutes * 60_000
  ) {
    throw new Error("Tempo da prova expirado.");
  }

  let autoScore = 0;

  for (const examQuestion of attempt.exam.questions) {
    const answer = String(fd.get("q_" + examQuestion.id) ?? "").trim();
    const question = examQuestion.question;
    let autoCorrect: boolean | null = null;
    let itemScore = 0;

    if (
      ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"].includes(question.type) &&
      question.correctAnswer
    ) {
      autoCorrect =
        normalize(answer) === normalize(question.correctAnswer);
      itemScore = autoCorrect ? Number(examQuestion.points) : 0;
      autoScore += itemScore;
    }

    await db.examAnswer.upsert({
      where: {
        attemptId_examQuestionId: {
          attemptId: attempt.id,
          examQuestionId: examQuestion.id,
        },
      },
      update: {
        answer: answer || null,
        autoCorrect,
        autoScore: itemScore,
      },
      create: {
        attemptId: attempt.id,
        examQuestionId: examQuestion.id,
        answer: answer || null,
        autoCorrect,
        autoScore: itemScore,
      },
    });
  }

  const hasManual = attempt.exam.questions.some((q) =>
    ["ESSAY"].includes(q.question.type),
  );

  await db.examAttempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      status: hasManual ? "PENDING_REVIEW" : "GRADED",
      autoScore,
      finalScore: autoScore,
    },
  });

  if (!hasManual) {
    await postAttemptToGradebook(attempt.id);
  }

  redirect("/provas");
}

export async function gradeExamAnswerAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");

  const p = z.object({
    answerId: z.string().min(1),
    manualScore: z.coerce.number().min(0),
    feedback: z.string().optional(),
  }).parse({
    answerId: String(fd.get("answerId") ?? ""),
    manualScore: fd.get("manualScore"),
    feedback: String(fd.get("feedback") ?? "").trim(),
  });

  const answer = await db.examAnswer.findFirst({
    where: {
      id: p.answerId,
      attempt: { organizationId: org.id },
    },
    include: {
      examQuestion: true,
      attempt: { include: { exam: true } },
    },
  });
  if (!answer) throw new Error("Resposta inválida.");

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    answer.attempt.exam.classGroupId,
    answer.attempt.exam.subjectId,
  );

  const max = Number(answer.examQuestion.points);
  if (p.manualScore > max) throw new Error("Nota acima do valor da questão.");

  await db.examAnswer.update({
    where: { id: answer.id },
    data: {
      manualScore: p.manualScore,
      manuallyGraded: true,
      feedback: p.feedback || null,
    },
  });

  const answers = await db.examAnswer.findMany({
    where: { attemptId: answer.attemptId },
  });

  const manualScore = answers.reduce(
    (sum, item) => sum + Number(item.manualScore),
    0,
  );
  const autoScore = answers.reduce(
    (sum, item) => sum + Number(item.autoScore),
    0,
  );

  const pendingEssay = await db.examAnswer.count({
    where: {
      attemptId: answer.attemptId,
      examQuestion: { question: { type: "ESSAY" } },
      manuallyGraded: false,
    },
  });

  const finalStatus = pendingEssay === 0 ? "GRADED" : "PENDING_REVIEW";

  await db.examAttempt.update({
    where: { id: answer.attemptId },
    data: {
      manualScore,
      finalScore: autoScore + manualScore,
      status: finalStatus,
    },
  });

  if (finalStatus === "GRADED") {
    await postAttemptToGradebook(answer.attemptId);
  }

  revalidatePath("/dashboard/correcoes");
}

export async function applyRubricAssessmentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");

  const p = z.object({
    rubricId: z.string().min(1),
    studentId: z.string().min(1),
    submissionId: z.string().optional(),
    totalScore: z.coerce.number().min(0),
    feedback: z.string().optional(),
    details: z.string().optional(),
  }).parse({
    rubricId: String(fd.get("rubricId") ?? ""),
    studentId: String(fd.get("studentId") ?? ""),
    submissionId: String(fd.get("submissionId") ?? "") || undefined,
    totalScore: fd.get("totalScore"),
    feedback: String(fd.get("feedback") ?? "").trim(),
    details: String(fd.get("details") ?? "").trim(),
  });

  const [rubric, student] = await Promise.all([
    db.rubric.findFirst({
      where: { id: p.rubricId, organizationId: org.id, active: true },
    }),
    db.student.findFirst({
      where: { id: p.studentId, organizationId: org.id },
    }),
  ]);
  if (!rubric || !student) throw new Error("Rubrica ou aluno inválido.");

  if (p.totalScore > Number(rubric.maxScore)) {
    throw new Error("Pontuação acima da nota máxima da rubrica.");
  }

  let details: Record<string, string | number | boolean | null> | undefined;
  if (p.details) {
    try {
      const parsed = JSON.parse(p.details);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Detalhes da rubrica devem ser um objeto JSON.");
      }
      details = parsed;
    } catch {
      throw new Error("Detalhes da rubrica devem ser JSON válido.");
    }
  }

  await db.rubricAssessment.create({
    data: {
      organizationId: org.id,
      rubricId: rubric.id,
      studentId: student.id,
      submissionId: p.submissionId || null,
      authorId: user.id,
      totalScore: p.totalScore,
      feedback: p.feedback || null,
      details,
    },
  });

  revalidatePath("/dashboard/rubricas-aplicadas");
}


export async function importQuestionBankCsvAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "create");
  const raw = z.string().min(1).parse(String(fd.get("csv") ?? ""));
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.length > 1001) throw new Error("Importação limitada a 1000 questões por vez.");

  let imported = 0;

  for (const row of lines.slice(1)) {
    const [type, prompt, correctAnswer, difficulty, tagsRaw, maxScoreRaw] =
      row.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));

    if (!type || !prompt) continue;
    if (!["MULTIPLE_CHOICE","TRUE_FALSE","SHORT_TEXT","ESSAY"].includes(type)) continue;

    await db.questionBankItem.create({
      data: {
        organizationId: org.id,
        authorId: user.id,
        type,
        prompt,
        correctAnswer: correctAnswer || null,
        difficulty: ["EASY","MEDIUM","HARD"].includes(difficulty) ? difficulty : "MEDIUM",
        tags: tagsRaw ? tagsRaw.split("|").map((tag) => tag.trim()).filter(Boolean) : [],
        maxScore: Number(maxScoreRaw || 1),
      },
    });
    imported += 1;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "IMPORT",
      entity: "QuestionBankItem",
      metadata: { imported },
    },
  });

  revalidatePath("/dashboard/banco-questoes");
}

export async function createExamBlueprintAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { org } = await requireModulePermission("assessments", "create");
  const p = z.object({
    name: z.string().min(2),
    subjectId: z.string().optional(),
    description: z.string().optional(),
    competencyId: z.string().min(1),
    questionType: z.string().optional(),
    difficulty: z.string().optional(),
    questionCount: z.coerce.number().int().min(1).max(50),
    pointsEach: z.coerce.number().positive(),
  }).parse({
    name: String(fd.get("name") ?? "").trim(),
    subjectId: String(fd.get("subjectId") ?? "") || undefined,
    description: String(fd.get("description") ?? "").trim(),
    competencyId: String(fd.get("competencyId") ?? ""),
    questionType: String(fd.get("questionType") ?? "") || undefined,
    difficulty: String(fd.get("difficulty") ?? "") || undefined,
    questionCount: fd.get("questionCount") || 5,
    pointsEach: fd.get("pointsEach") || 1,
  });

  const competency = await db.curriculumCompetency.findFirst({
    where: { id: p.competencyId, organizationId: org.id },
  });
  if (!competency) throw new Error("Competência inválida.");

  await db.examBlueprint.create({
    data: {
      organizationId: org.id,
      subjectId: p.subjectId || null,
      name: p.name,
      description: p.description || null,
      components: {
        create: {
          competencyId: competency.id,
          questionType: p.questionType || null,
          difficulty: p.difficulty || null,
          questionCount: p.questionCount,
          pointsEach: p.pointsEach,
        },
      },
    },
  });

  revalidatePath("/dashboard/blueprints");
}

export async function generateExamFromBlueprintAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "create");
  const p = z.object({
    blueprintId: z.string().min(1),
    classGroupId: z.string().min(1),
    subjectId: z.string().min(1),
    academicPeriodId: z.string().optional(),
    title: z.string().min(2),
  }).parse({
    blueprintId: String(fd.get("blueprintId") ?? ""),
    classGroupId: String(fd.get("classGroupId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? ""),
    academicPeriodId: String(fd.get("academicPeriodId") ?? "") || undefined,
    title: String(fd.get("title") ?? "").trim(),
  });

  await requireTeacherAssessmentScope(user.id, org.id, p.classGroupId, p.subjectId);

  const blueprint = await db.examBlueprint.findFirst({
    where: { id: p.blueprintId, organizationId: org.id, active: true },
    include: { components: true },
  });
  if (!blueprint) throw new Error("Blueprint inválido.");

  const selected: { questionId: string; points: number; competencyId: string }[] = [];

  for (const component of blueprint.components) {
    const questions = await db.questionBankItem.findMany({
      where: {
        organizationId: org.id,
        active: true,
        OR: [{ subjectId: p.subjectId }, { subjectId: null }],
        ...(component.questionType ? { type: component.questionType } : {}),
        ...(component.difficulty ? { difficulty: component.difficulty } : {}),
        competencies: { some: { competencyId: component.competencyId } },
      },
      take: component.questionCount,
      orderBy: { createdAt: "desc" },
    });

    if (questions.length < component.questionCount) {
      throw new Error("Banco insuficiente para um dos componentes do blueprint.");
    }

    for (const question of questions) {
      selected.push({
        questionId: question.id,
        points: Number(component.pointsEach),
        competencyId: component.competencyId,
      });
    }
  }

  await db.exam.create({
    data: {
      organizationId: org.id,
      classGroupId: p.classGroupId,
      subjectId: p.subjectId,
      authorId: user.id,
      academicPeriodId: p.academicPeriodId || null,
      title: p.title,
      type: "EXAM",
      postToGradebook: true,
      gradeLabel: p.title,
      questions: {
        create: selected.map((item, index) => ({
          questionId: item.questionId,
          position: index + 1,
          points: item.points,
          competencies: { create: { competencyId: item.competencyId } },
        })),
      },
    },
  });

  revalidatePath("/dashboard/provas");
}


export async function grantExamAttemptAllowanceAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");
  const p = z.object({
    examId: z.string().min(1),
    studentId: z.string().min(1),
    type: z.enum(["SECOND_CALL", "SUBSTITUTE", "EXTRA_ATTEMPT"]),
    extraAttempts: z.coerce.number().int().min(1).max(3),
    reason: z.string().min(2),
    validUntil: z.string().optional(),
  }).parse({
    examId: String(fd.get("examId") ?? ""),
    studentId: String(fd.get("studentId") ?? ""),
    type: String(fd.get("type") ?? "SECOND_CALL"),
    extraAttempts: fd.get("extraAttempts") || 1,
    reason: String(fd.get("reason") ?? "").trim(),
    validUntil: String(fd.get("validUntil") ?? ""),
  });

  const [exam, student] = await Promise.all([
    db.exam.findFirst({ where: { id: p.examId, organizationId: org.id } }),
    db.student.findFirst({ where: { id: p.studentId, organizationId: org.id } }),
  ]);
  if (!exam || !student) throw new Error("Prova ou aluno inválido.");

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    exam.classGroupId,
    exam.subjectId,
  );

  await db.examAttemptAllowance.create({
    data: {
      organizationId: org.id,
      examId: exam.id,
      studentId: student.id,
      grantedById: user.id,
      type: p.type,
      extraAttempts: p.extraAttempts,
      reason: p.reason,
      validUntil: p.validUntil ? new Date(p.validUntil) : null,
    },
  });

  revalidatePath("/dashboard/segunda-chamada");
}

export async function generateRecoveryExamAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");
  const recoveryCaseId = z.string().min(1).parse(String(fd.get("caseId") ?? ""));

  const recoveryCase = await db.examRecoveryCase.findFirst({
    where: { id: recoveryCaseId, organizationId: org.id, status: "ELIGIBLE" },
    include: {
      originalExam: {
        include: {
          questions: {
            include: { competencies: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });
  if (!recoveryCase) throw new Error("Caso de recuperação inválido.");

  const original = recoveryCase.originalExam;

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    original.classGroupId,
    original.subjectId,
  );

  await db.$transaction(async (tx) => {
    const created = await tx.exam.create({
      data: {
        organizationId: org.id,
        classGroupId: original.classGroupId,
        subjectId: original.subjectId,
        authorId: user.id,
        academicPeriodId: original.academicPeriodId,
        title: "Recuperação · " + original.title,
        description: "Avaliação de recuperação individual.",
        type: "RECOVERY",
        durationMinutes: original.durationMinutes,
        maxAttempts: 1,
        shuffleQuestions: true,
        restrictedAccess: true,
        postToGradebook: false,
        gradeLabel: "Recuperação · " + (original.gradeLabel || original.title),
        published: true,
        questions: {
          create: original.questions.map((item, index) => ({
            questionId: item.questionId,
            position: index + 1,
            points: item.points,
            competencies: {
              create: item.competencies.map((link) => ({
                competencyId: link.competencyId,
              })),
            },
          })),
        },
      },
    });

    await tx.examAttemptAllowance.create({
      data: {
        organizationId: org.id,
        examId: created.id,
        studentId: recoveryCase.studentId,
        grantedById: user.id,
        type: "RECOVERY",
        extraAttempts: 1,
        reason: "Recuperação automática por desempenho abaixo da média.",
      },
    });

    await tx.examRecoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "SCHEDULED", recoveryExamId: created.id },
    });

    return created;
  });

  revalidatePath("/dashboard/recuperacoes-avaliacoes");
  revalidatePath("/provas");
}

export async function requestExamReviewAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) throw new Error("Nenhuma escola ativa.");

  const p = z.object({
    attemptId: z.string().min(1),
    reason: z.string().min(5).max(2000),
  }).parse({
    attemptId: String(fd.get("attemptId") ?? ""),
    reason: String(fd.get("reason") ?? "").trim(),
  });

  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
  });
  if (!link) throw new Error("Aluno não vinculado.");

  const attempt = await db.examAttempt.findFirst({
    where: {
      id: p.attemptId,
      organizationId: org.id,
      studentId: link.studentId,
      status: "GRADED",
    },
  });
  if (!attempt) throw new Error("Tentativa inválida.");

  const pending = await db.examReviewRequest.findFirst({
    where: { attemptId: attempt.id, status: "PENDING" },
  });
  if (pending) throw new Error("Já existe revisão pendente.");

  await db.examReviewRequest.create({
    data: {
      organizationId: org.id,
      examId: attempt.examId,
      attemptId: attempt.id,
      studentId: attempt.studentId,
      createdById: user.id,
      reason: p.reason,
    },
  });

  revalidatePath("/provas");
  revalidatePath("/dashboard/revisoes-provas");
}

export async function reviewExamRequestAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("assessments", "update");
  const p = z.object({
    id: z.string().min(1),
    status: z.enum(["APPROVED", "REJECTED"]),
    response: z.string().min(2),
  }).parse({
    id: String(fd.get("id") ?? ""),
    status: String(fd.get("status") ?? ""),
    response: String(fd.get("response") ?? "").trim(),
  });

  const request = await db.examReviewRequest.findFirst({
    where: { id: p.id, organizationId: org.id, status: "PENDING" },
    include: { exam: true },
  });
  if (!request) throw new Error("Revisão inválida.");

  await requireTeacherAssessmentScope(
    user.id,
    org.id,
    request.exam.classGroupId,
    request.exam.subjectId,
  );

  await db.examReviewRequest.update({
    where: { id: request.id },
    data: {
      status: p.status,
      response: p.response,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/dashboard/revisoes-provas");
}

export async function recordExamIntegrityEventAction(
  attemptId: string,
  type: "FOCUS_LOSS" | "COPY" | "PASTE" | "VISIBILITY_HIDDEN",
) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) return;

  const link = await db.studentUser.findFirst({
    where: { userId: user.id, student: { organizationId: org.id } },
  });
  if (!link) return;

  const attempt = await db.examAttempt.findFirst({
    where: {
      id: attemptId,
      organizationId: org.id,
      studentId: link.studentId,
      status: "IN_PROGRESS",
    },
  });
  if (!attempt) return;

  const penalty =
    type === "COPY" || type === "PASTE" ? 10 : 5;

  await db.$transaction([
    db.examIntegrityEvent.create({
      data: {
        organizationId: org.id,
        attemptId: attempt.id,
        type,
        penalty,
      },
    }),
    db.examAttempt.update({
      where: { id: attempt.id },
      data: {
        integrityScore: { decrement: penalty },
      },
    }),
  ]);
}

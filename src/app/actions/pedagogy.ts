"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

async function ensureTeacherScope(
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
    const assigned = await db.classSubject.findFirst({
      where: {
        classGroupId,
        subjectId,
        teacherId: userId,
        classGroup: { organizationId: orgId },
      },
    });
    if (!assigned) throw new Error("Professor sem vínculo com esta turma/disciplina.");
    return;
  }

  throw new Error("Sem permissão para este lançamento pedagógico.");
}

export async function createCurriculumFrameworkAction(fd: FormData) {
  const { org } = await requireModulePermission("curriculum", "create");
  const p = z.object({
    name: z.string().min(2),
    version: z.string().optional(),
    source: z.string().optional(),
    description: z.string().optional(),
  }).parse({
    name: String(fd.get("name") ?? "").trim(),
    version: String(fd.get("version") ?? "").trim(),
    source: String(fd.get("source") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
  });

  await db.curriculumFramework.create({
    data: {
      organizationId: org.id,
      name: p.name,
      version: p.version || null,
      source: p.source || null,
      description: p.description || null,
    },
  });

  revalidatePath("/dashboard/curriculo");
}

export async function createCurriculumCompetencyAction(fd: FormData) {
  const { org } = await requireModulePermission("curriculum", "create");
  const p = z.object({
    frameworkId: z.string().min(1),
    code: z.string().min(1),
    title: z.string().min(2),
    description: z.string().optional(),
    gradeLevel: z.string().optional(),
    subjectArea: z.string().optional(),
  }).parse({
    frameworkId: String(fd.get("frameworkId") ?? ""),
    code: String(fd.get("code") ?? "").trim().toUpperCase(),
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    gradeLevel: String(fd.get("gradeLevel") ?? "").trim(),
    subjectArea: String(fd.get("subjectArea") ?? "").trim(),
  });

  const framework = await db.curriculumFramework.findFirst({
    where: { id: p.frameworkId, organizationId: org.id, active: true },
  });
  if (!framework) throw new Error("Referencial curricular inválido.");

  await db.curriculumCompetency.create({
    data: {
      organizationId: org.id,
      frameworkId: framework.id,
      code: p.code,
      title: p.title,
      description: p.description || null,
      gradeLevel: p.gradeLevel || null,
      subjectArea: p.subjectArea || null,
    },
  });

  revalidatePath("/dashboard/curriculo");
}

export async function createCurriculumMatrixAction(fd: FormData) {
  const { org } = await requireModulePermission("curriculum", "create");
  const p = z.object({
    frameworkId: z.string().min(1),
    name: z.string().min(2),
    gradeLevel: z.string().min(1),
    weeklyHours: z.coerce.number().int().min(1).optional(),
  }).parse({
    frameworkId: String(fd.get("frameworkId") ?? ""),
    name: String(fd.get("name") ?? "").trim(),
    gradeLevel: String(fd.get("gradeLevel") ?? "").trim(),
    weeklyHours: fd.get("weeklyHours") || undefined,
  });

  const framework = await db.curriculumFramework.findFirst({
    where: { id: p.frameworkId, organizationId: org.id },
  });
  if (!framework) throw new Error("Referencial curricular inválido.");

  await db.curriculumMatrix.create({
    data: {
      organizationId: org.id,
      frameworkId: framework.id,
      name: p.name,
      gradeLevel: p.gradeLevel,
      weeklyHours: p.weeklyHours ?? null,
    },
  });

  revalidatePath("/dashboard/curriculo");
}

export async function addMatrixSubjectAction(fd: FormData) {
  const { org } = await requireModulePermission("curriculum", "update");
  const p = z.object({
    matrixId: z.string().min(1),
    subjectId: z.string().min(1),
    weeklyHours: z.coerce.number().int().min(1),
    annualHours: z.coerce.number().int().min(1).optional(),
  }).parse({
    matrixId: String(fd.get("matrixId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? ""),
    weeklyHours: fd.get("weeklyHours"),
    annualHours: fd.get("annualHours") || undefined,
  });

  const [matrix, subject] = await Promise.all([
    db.curriculumMatrix.findFirst({
      where: { id: p.matrixId, organizationId: org.id },
    }),
    db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    }),
  ]);
  if (!matrix || !subject) throw new Error("Matriz ou disciplina inválida.");

  await db.curriculumMatrixSubject.upsert({
    where: {
      matrixId_subjectId: {
        matrixId: matrix.id,
        subjectId: subject.id,
      },
    },
    update: {
      weeklyHours: p.weeklyHours,
      annualHours: p.annualHours ?? null,
    },
    create: {
      matrixId: matrix.id,
      subjectId: subject.id,
      weeklyHours: p.weeklyHours,
      annualHours: p.annualHours ?? null,
    },
  });

  revalidatePath("/dashboard/curriculo");
}

export async function createRubricAction(fd: FormData) {
  const { user, org } = await requireModulePermission("pedagogy", "create");
  const p = z.object({
    subjectId: z.string().optional(),
    name: z.string().min(2),
    description: z.string().optional(),
    maxScore: z.coerce.number().positive(),
    criterionTitle: z.string().min(2),
    criterionDescription: z.string().optional(),
    criterionWeight: z.coerce.number().positive(),
    competencyId: z.string().optional(),
  }).parse({
    subjectId: String(fd.get("subjectId") ?? "") || undefined,
    name: String(fd.get("name") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    maxScore: fd.get("maxScore") || 10,
    criterionTitle: String(fd.get("criterionTitle") ?? "").trim(),
    criterionDescription: String(fd.get("criterionDescription") ?? "").trim(),
    criterionWeight: fd.get("criterionWeight") || 1,
    competencyId: String(fd.get("competencyId") ?? "") || undefined,
  });

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

  await db.rubric.create({
    data: {
      organizationId: org.id,
      subjectId: p.subjectId || null,
      createdById: user.id,
      name: p.name,
      description: p.description || null,
      maxScore: p.maxScore,
      criteria: {
        create: {
          title: p.criterionTitle,
          description: p.criterionDescription || null,
          weight: p.criterionWeight,
          ...(p.competencyId
            ? {
                competencies: {
                  create: { competencyId: p.competencyId },
                },
              }
            : {}),
        },
      },
    },
  });

  revalidatePath("/dashboard/rubricas");
}

export async function createLessonPlanAction(fd: FormData) {
  const { user, org } = await requireModulePermission("pedagogy", "create");
  const p = z.object({
    classGroupId: z.string().min(1),
    subjectId: z.string().min(1),
    competencyId: z.string().optional(),
    title: z.string().min(2),
    objectives: z.string().min(3),
    methodology: z.string().optional(),
    resources: z.string().optional(),
    assessment: z.string().optional(),
    plannedDate: z.string().min(1),
  }).parse({
    classGroupId: String(fd.get("classGroupId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? ""),
    competencyId: String(fd.get("competencyId") ?? "") || undefined,
    title: String(fd.get("title") ?? "").trim(),
    objectives: String(fd.get("objectives") ?? "").trim(),
    methodology: String(fd.get("methodology") ?? "").trim(),
    resources: String(fd.get("resources") ?? "").trim(),
    assessment: String(fd.get("assessment") ?? "").trim(),
    plannedDate: String(fd.get("plannedDate") ?? ""),
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

  await ensureTeacherScope(user.id, org.id, group.id, subject.id);

  if (p.competencyId) {
    const competency = await db.curriculumCompetency.findFirst({
      where: { id: p.competencyId, organizationId: org.id },
    });
    if (!competency) throw new Error("Competência inválida.");
  }

  await db.lessonPlan.create({
    data: {
      organizationId: org.id,
      classGroupId: group.id,
      subjectId: subject.id,
      createdById: user.id,
      title: p.title,
      objectives: p.objectives,
      methodology: p.methodology || null,
      resources: p.resources || null,
      assessment: p.assessment || null,
      plannedDate: new Date(p.plannedDate),
      ...(p.competencyId
        ? {
            competencies: {
              create: { competencyId: p.competencyId },
            },
          }
        : {}),
    },
  });

  revalidatePath("/dashboard/planos-aula");
}

export async function createPedagogicalInterventionAction(fd: FormData) {
  const { user, org } = await requireModulePermission("pedagogy", "create");
  const p = z.object({
    studentId: z.string().min(1),
    classGroupId: z.string().optional(),
    reason: z.string().min(3),
    plan: z.string().min(3),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    classGroupId: String(fd.get("classGroupId") ?? "") || undefined,
    reason: String(fd.get("reason") ?? "").trim(),
    plan: String(fd.get("plan") ?? "").trim(),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
  });

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id },
  });
  if (!student) throw new Error("Aluno inválido.");

  if (p.classGroupId) {
    const group = await db.classGroup.findFirst({
      where: { id: p.classGroupId, organizationId: org.id },
    });
    if (!group) throw new Error("Turma inválida.");
  }

  await db.pedagogicalIntervention.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      classGroupId: p.classGroupId || null,
      createdById: user.id,
      reason: p.reason,
      plan: p.plan,
      startsAt: p.startsAt ? new Date(p.startsAt) : new Date(),
      endsAt: p.endsAt ? new Date(p.endsAt) : null,
    },
  });

  revalidatePath("/dashboard/intervencoes");
}

export async function closePedagogicalInterventionAction(fd: FormData) {
  const { org } = await requireModulePermission("pedagogy", "update");
  const p = z.object({
    id: z.string().min(1),
    outcome: z.string().min(3),
  }).parse({
    id: String(fd.get("id") ?? ""),
    outcome: String(fd.get("outcome") ?? "").trim(),
  });

  const intervention = await db.pedagogicalIntervention.findFirst({
    where: { id: p.id, organizationId: org.id },
  });
  if (!intervention) throw new Error("Intervenção inválida.");

  await db.pedagogicalIntervention.update({
    where: { id: intervention.id },
    data: {
      status: "COMPLETED",
      outcome: p.outcome,
      endsAt: intervention.endsAt ?? new Date(),
    },
  });

  revalidatePath("/dashboard/intervencoes");
}

export async function assessCompetencyAction(fd: FormData) {
  const { user, org } = await requireModulePermission("pedagogy", "create");
  const p = z.object({
    studentId: z.string().min(1),
    competencyId: z.string().min(1),
    subjectId: z.string().optional(),
    classGroupId: z.string().optional(),
    level: z.enum(["NOT_STARTED", "DEVELOPING", "PROFICIENT", "ADVANCED"]),
    score: z.coerce.number().min(0).max(10).optional(),
    evidence: z.string().optional(),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    competencyId: String(fd.get("competencyId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? "") || undefined,
    classGroupId: String(fd.get("classGroupId") ?? "") || undefined,
    level: String(fd.get("level") ?? "DEVELOPING"),
    score: fd.get("score") || undefined,
    evidence: String(fd.get("evidence") ?? "").trim(),
  });

  const [student, competency] = await Promise.all([
    db.student.findFirst({ where: { id: p.studentId, organizationId: org.id } }),
    db.curriculumCompetency.findFirst({
      where: { id: p.competencyId, organizationId: org.id },
    }),
  ]);
  if (!student || !competency) throw new Error("Aluno ou competência inválida.");

  if (p.subjectId && p.classGroupId) {
    await ensureTeacherScope(user.id, org.id, p.classGroupId, p.subjectId);
  }

  await db.competencyAssessment.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      competencyId: competency.id,
      subjectId: p.subjectId || null,
      classGroupId: p.classGroupId || null,
      authorId: user.id,
      level: p.level,
      score: p.score ?? null,
      evidence: p.evidence || null,
    },
  });

  revalidatePath("/dashboard/competencias");
}

export async function createPedagogicalObservationAction(fd: FormData) {
  const { user, org } = await requireModulePermission("pedagogy", "create");
  const p = z.object({
    studentId: z.string().min(1),
    category: z.string().min(2),
    note: z.string().min(3),
    visibility: z.enum(["STAFF", "FAMILY"]),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    category: String(fd.get("category") ?? "").trim(),
    note: String(fd.get("note") ?? "").trim(),
    visibility: String(fd.get("visibility") ?? "STAFF"),
  });

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id },
  });
  if (!student) throw new Error("Aluno inválido.");

  await db.pedagogicalObservation.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      authorId: user.id,
      category: p.category,
      note: p.note,
      visibility: p.visibility,
    },
  });

  revalidatePath("/dashboard/evolucao/" + student.id);
}

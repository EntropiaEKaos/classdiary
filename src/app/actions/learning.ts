"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission, requireSchoolRole } from "@/lib/rbac";
import { requireUser, activeOrganization } from "@/lib/auth";

async function assertLearningTeacherScope(params: {
  userId: string;
  organizationId: string;
  classGroupId: string;
  subjectId: string;
}) {
  const membership = await db.membership.findFirst({
    where: {
      userId: params.userId,
      organizationId: params.organizationId,
    },
    select: { role: true },
  });

  if (!membership) throw new Error("Usuário sem vínculo com a escola.");

  if (["SCHOOL_ADMIN", "COORDINATOR"].includes(membership.role)) return;

  if (membership.role !== "TEACHER") {
    throw new Error("Sem permissão para esta operação pedagógica.");
  }

  const assignment = await db.classSubject.findFirst({
    where: {
      classGroupId: params.classGroupId,
      subjectId: params.subjectId,
      teacherId: params.userId,
      classGroup: { organizationId: params.organizationId },
      subject: { organizationId: params.organizationId },
    },
  });

  if (!assignment) {
    throw new Error("Professor não está vinculado a esta turma/disciplina.");
  }
}

export async function createAssignmentAction(fd: FormData) {
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const p = z
    .object({
      classGroupId: z.string().min(1),
      subjectId: z.string().min(1),
      title: z.string().min(2),
      description: z.string().optional(),
      dueAt: z.string().optional(),
      academicPeriodId: z.string().optional(),
      maxScore: z.coerce.number().positive().max(100).optional(),
    })
    .parse({
      classGroupId: String(fd.get("classGroupId") ?? ""),
      subjectId: String(fd.get("subjectId") ?? ""),
      title: String(fd.get("title") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim(),
      dueAt: String(fd.get("dueAt") ?? ""),
      academicPeriodId: String(fd.get("academicPeriodId") ?? "") || undefined,
      maxScore: fd.get("maxScore") || undefined,
    });

  const dueAt = p.dueAt ? new Date(p.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    throw new Error("Prazo inválido.");
  }

  const [group, subject] = await Promise.all([
    db.classGroup.findFirst({
      where: { id: p.classGroupId, organizationId: org.id },
    }),
    db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    }),
  ]);

  if (!group || !subject) {
    throw new Error("Turma ou disciplina inválida.");
  }

  await assertLearningTeacherScope({
    userId: user.id,
    organizationId: org.id,
    classGroupId: group.id,
    subjectId: subject.id,
  });

  if (p.academicPeriodId) {
    const period = await db.academicPeriod.findFirst({
      where: {
        id: p.academicPeriodId,
        organizationId: org.id,
        schoolYearId: group.schoolYearId,
      },
    });

    if (!period) {
      throw new Error("Período acadêmico inválido para a turma.");
    }
  }

  const assignment = await db.assignment.create({
    data: {
      organizationId: org.id,
      classGroupId: group.id,
      subjectId: subject.id,
      authorId: user.id,
      academicPeriodId: p.academicPeriodId || null,
      title: p.title,
      description: p.description || null,
      dueAt,
      maxScore: p.maxScore ?? null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Assignment",
      entityId: assignment.id,
    },
  });

  revalidatePath("/dashboard/atividades");
}

export async function submitAssignmentAction(fd: FormData) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/login");

  const assignmentId = String(fd.get("assignmentId") ?? "");
  const content = String(fd.get("content") ?? "").trim();
  const fileUrl = String(fd.get("fileUrl") ?? "").trim();

  if (!content && !fileUrl) {
    throw new Error("Informe uma resposta ou anexo.");
  }

  if (fileUrl && !z.string().url().safeParse(fileUrl).success) {
    throw new Error("URL do anexo inválida.");
  }

  const link = await db.studentUser.findFirst({
    where: {
      userId: user.id,
      student: { organizationId: org.id, active: true },
    },
  });

  if (!link) throw new Error("Perfil de aluno não encontrado.");

  const assignment = await db.assignment.findFirst({
    where: {
      id: assignmentId,
      organizationId: org.id,
      classGroup: {
        organizationId: org.id,
        enrollments: {
          some: {
            studentId: link.studentId,
            active: true,
          },
        },
      },
      subject: { organizationId: org.id },
    },
  });

  if (!assignment) throw new Error("Atividade inválida.");

  const submission = await db.assignmentSubmission.upsert({
    where: {
      assignmentId_studentId: {
        assignmentId,
        studentId: link.studentId,
      },
    },
    update: {
      content: content || null,
      fileUrl: fileUrl || null,
      userId: user.id,
      submittedAt: new Date(),
    },
    create: {
      assignmentId,
      studentId: link.studentId,
      userId: user.id,
      content: content || null,
      fileUrl: fileUrl || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "SUBMIT",
      entity: "AssignmentSubmission",
      entityId: submission.id,
      metadata: { assignmentId },
    },
  });

  revalidatePath("/aluno");
}

export async function createRecoveryAction(fd: FormData) {
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const p = z
    .object({
      studentId: z.string().min(1),
      subjectId: z.string().min(1),
      period: z.string().min(1),
      value: z.coerce.number().min(0).max(10),
      notes: z.string().optional(),
    })
    .parse({
      studentId: String(fd.get("studentId") ?? ""),
      subjectId: String(fd.get("subjectId") ?? ""),
      period: String(fd.get("period") ?? "").trim(),
      value: fd.get("value"),
      notes: String(fd.get("notes") ?? "").trim(),
    });

  const [student, subject, year] = await Promise.all([
    db.student.findFirst({
      where: { id: p.studentId, organizationId: org.id, active: true },
      include: {
        enrollments: {
          where: { active: true },
          include: { classGroup: true },
        },
      },
    }),
    db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    }),
    db.schoolYear.findFirst({
      where: { organizationId: org.id, active: true },
    }),
  ]);

  if (!student || !subject) {
    throw new Error("Aluno ou disciplina inválida.");
  }

  const enrollment = student.enrollments.find(
    (item) => !year || item.classGroup.schoolYearId === year.id,
  );

  if (!enrollment) {
    throw new Error("Aluno sem matrícula ativa no ano letivo atual.");
  }

  await assertLearningTeacherScope({
    userId: user.id,
    organizationId: org.id,
    classGroupId: enrollment.classGroupId,
    subjectId: subject.id,
  });

  let academicPeriod = null;

  if (year) {
    academicPeriod = await db.academicPeriod.findFirst({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
        name: p.period,
      },
    });
    if (!academicPeriod) throw new Error("Período acadêmico inválido.");
  }

  const recovery = await db.recoveryGrade.create({
    data: {
      studentId: student.id,
      subjectId: subject.id,
      schoolYearId: year?.id ?? null,
      classGroupId: enrollment.classGroupId,
      academicPeriodId: academicPeriod?.id ?? null,
      period: p.period,
      value: p.value,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "RecoveryGrade",
      entityId: recovery.id,
    },
  });

  revalidatePath("/dashboard/recuperacao");
}

export async function createCouncilDecisionAction(fd: FormData) {
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });
  if (!year) throw new Error("Ano letivo não encontrado.");

  const p = z
    .object({
      studentId: z.string().min(1),
      period: z.string().min(1),
      decision: z.string().min(2),
      notes: z.string().optional(),
    })
    .parse({
      studentId: String(fd.get("studentId") ?? ""),
      period: String(fd.get("period") ?? "").trim(),
      decision: String(fd.get("decision") ?? "").trim(),
      notes: String(fd.get("notes") ?? "").trim(),
    });

  const [student, period] = await Promise.all([
    db.student.findFirst({
      where: {
        id: p.studentId,
        organizationId: org.id,
        enrollments: {
          some: {
            active: true,
            classGroup: { schoolYearId: year.id },
          },
        },
      },
    }),
    db.academicPeriod.findFirst({
      where: {
        organizationId: org.id,
        schoolYearId: year.id,
        name: p.period,
      },
    }),
  ]);

  if (!student || !period) {
    throw new Error("Aluno ou período inválido.");
  }

  const decision = await db.councilDecision.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      authorId: user.id,
      schoolYearId: year.id,
      period: period.name,
      decision: p.decision,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "CouncilDecision",
      entityId: decision.id,
    },
  });

  revalidatePath("/dashboard/conselho");
}

export async function createAcademicDocumentAction(fd: FormData) {
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z
    .object({
      studentId: z.string().min(1),
      type: z.string().min(2),
      title: z.string().min(2),
    })
    .parse({
      studentId: String(fd.get("studentId") ?? ""),
      type: String(fd.get("type") ?? "").trim(),
      title: String(fd.get("title") ?? "").trim(),
    });

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id },
  });

  if (!student) throw new Error("Aluno inválido.");

  const doc = await db.academicDocument.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      authorId: user.id,
      type: p.type,
      title: p.title,
      payload: { issuedAt: new Date().toISOString() },
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "AcademicDocument",
      entityId: doc.id,
    },
  });

  revalidatePath("/dashboard/documentos");
}

export async function generateDocumentFromTemplateAction(fd: FormData) {
  const { user, org } = await requireModulePermission("secretary", "create");

  const p = z
    .object({
      studentId: z.string().min(1),
      templateId: z.string().min(1),
      title: z.string().min(2),
    })
    .parse({
      studentId: String(fd.get("studentId") ?? ""),
      templateId: String(fd.get("templateId") ?? ""),
      title: String(fd.get("title") ?? "").trim(),
    });

  const [student, template] = await Promise.all([
    db.student.findFirst({
      where: { id: p.studentId, organizationId: org.id },
      include: {
        enrollments: {
          where: { active: true },
          include: { classGroup: true },
        },
      },
    }),
    db.documentTemplate.findFirst({
      where: {
        id: p.templateId,
        organizationId: org.id,
        active: true,
      },
    }),
  ]);

  if (!student || !template) {
    throw new Error("Aluno ou template inválido.");
  }

  const rendered = template.body
    .replaceAll("{{student}}", student.name)
    .replaceAll("{{registration}}", student.registration)
    .replaceAll("{{school}}", org.name)
    .replaceAll("{{class}}", student.enrollments[0]?.classGroup.name ?? "")
    .replaceAll("{{date}}", new Date().toLocaleDateString("pt-BR"));

  const doc = await db.academicDocument.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      authorId: user.id,
      type: template.type,
      title: p.title,
      payload: {
        templateId: template.id,
        templateCode: template.code,
        renderedBody: rendered,
        issuedAt: new Date().toISOString(),
      },
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "GENERATE",
      entity: "AcademicDocument",
      entityId: doc.id,
      metadata: { templateId: template.id },
    },
  });

  revalidatePath("/dashboard/documentos");
}

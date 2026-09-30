"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { retrySerializable } from "@/lib/transaction-retry";
import { requireSchoolRole } from "@/lib/rbac";

async function getMembershipRole(userId: string, organizationId: string) {
  return db.membership.findFirst({
    where: { userId, organizationId },
    select: { role: true },
  });
}

async function assertTeacherScope(params: {
  actorId: string;
  organizationId: string;
  classGroupId: string;
  subjectId: string;
}) {
  const membership = await getMembershipRole(
    params.actorId,
    params.organizationId,
  );

  if (!membership) throw new Error("Usuário sem vínculo com esta escola.");

  if (["SCHOOL_ADMIN", "COORDINATOR"].includes(membership.role)) return;

  if (membership.role !== "TEACHER") {
    throw new Error("Sem permissão para esta operação acadêmica.");
  }

  const assignment = await db.classSubject.findFirst({
    where: {
      classGroupId: params.classGroupId,
      subjectId: params.subjectId,
      teacherId: params.actorId,
      classGroup: { organizationId: params.organizationId },
      subject: { organizationId: params.organizationId },
    },
  });

  if (!assignment) {
    throw new Error("Professor não está vinculado a esta turma/disciplina.");
  }
}

export async function enrollStudentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z
    .object({
      studentId: z.string().min(1),
      classGroupId: z.string().min(1),
    })
    .parse({
      studentId: String(fd.get("studentId") ?? ""),
      classGroupId: String(fd.get("classGroupId") ?? ""),
    });

  const [student, group] = await Promise.all([
    db.student.findFirst({
      where: { id: p.studentId, organizationId: org.id },
    }),
    db.classGroup.findFirst({
      where: { id: p.classGroupId, organizationId: org.id },
    }),
  ]);

  if (!student || !group) {
    throw new Error("Aluno ou turma inválidos.");
  }

  const enrollment = await retrySerializable(() => db.$transaction(async (tx) => {
    const activeSameYear = await tx.enrollment.findMany({
      where: {
        studentId: student.id,
        active: true,
        classGroup: {
          organizationId: org.id,
          schoolYearId: group.schoolYearId,
        },
        NOT: { classGroupId: group.id },
      },
      select: { id: true },
    });

    if (activeSameYear.length) {
      await tx.enrollment.updateMany({
        where: { id: { in: activeSameYear.map((item) => item.id) } },
        data: { active: false },
      });
    }

    return tx.enrollment.upsert({
      where: {
        studentId_classGroupId: {
          studentId: student.id,
          classGroupId: group.id,
        },
      },
      update: { active: true },
      create: {
        studentId: student.id,
        classGroupId: group.id,
      },
    });
  }, { isolationLevel: "Serializable" }));

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "Enrollment",
      entityId: enrollment.id,
      metadata: { schoolYearId: group.schoolYearId },
    },
  });

  revalidatePath("/dashboard/matriculas");
  revalidatePath("/dashboard/turmas");
}

export async function createSubjectAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const p = z
    .object({
      name: z.string().min(2),
      code: z.string().optional(),
    })
    .parse({
      name: String(fd.get("name") ?? "").trim(),
      code: String(fd.get("code") ?? "").trim(),
    });

  const subject = await db.subject.create({
    data: {
      organizationId: org.id,
      name: p.name,
      code: p.code || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Subject",
      entityId: subject.id,
    },
  });

  revalidatePath("/dashboard/disciplinas");
}

export async function assignSubjectAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const p = z
    .object({
      classGroupId: z.string().min(1),
      subjectId: z.string().min(1),
      teacherId: z.string().optional(),
    })
    .parse({
      classGroupId: String(fd.get("classGroupId") ?? ""),
      subjectId: String(fd.get("subjectId") ?? ""),
      teacherId: String(fd.get("teacherId") ?? "") || undefined,
    });

  const [group, subject, teacherMembership] = await Promise.all([
    db.classGroup.findFirst({
      where: { id: p.classGroupId, organizationId: org.id },
    }),
    db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    }),
    p.teacherId
      ? db.membership.findFirst({
          where: {
            organizationId: org.id,
            userId: p.teacherId,
            role: "TEACHER",
            user: { active: true },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!group || !subject) {
    throw new Error("Turma ou disciplina inválida.");
  }

  if (p.teacherId && !teacherMembership) {
    throw new Error("Professor inválido para esta escola.");
  }

  const link = await db.classSubject.upsert({
    where: {
      classGroupId_subjectId: {
        classGroupId: group.id,
        subjectId: subject.id,
      },
    },
    update: { teacherId: p.teacherId || null },
    create: {
      classGroupId: group.id,
      subjectId: subject.id,
      teacherId: p.teacherId || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "ClassSubject",
      entityId: link.id,
      metadata: { teacherId: p.teacherId ?? null },
    },
  });

  revalidatePath("/dashboard/disciplinas");
}

export async function createLessonAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const p = z
    .object({
      classGroupId: z.string().min(1),
      subjectId: z.string().min(1),
      teacherId: z.string().optional(),
      title: z.string().min(2),
      content: z.string().optional(),
      homework: z.string().optional(),
    })
    .parse({
      classGroupId: String(fd.get("classGroupId") ?? ""),
      subjectId: String(fd.get("subjectId") ?? ""),
      teacherId: String(fd.get("teacherId") ?? "") || undefined,
      title: String(fd.get("title") ?? "").trim(),
      content: String(fd.get("content") ?? "").trim(),
      homework: String(fd.get("homework") ?? "").trim(),
    });

  const [group, subject, membership] = await Promise.all([
    db.classGroup.findFirst({
      where: { id: p.classGroupId, organizationId: org.id },
    }),
    db.subject.findFirst({
      where: { id: p.subjectId, organizationId: org.id },
    }),
    getMembershipRole(user.id, org.id),
  ]);

  if (!group || !subject || !membership) {
    throw new Error("Turma, disciplina ou vínculo inválido.");
  }

  await assertTeacherScope({
    actorId: user.id,
    organizationId: org.id,
    classGroupId: group.id,
    subjectId: subject.id,
  });

  let teacherId = user.id;

  if (["SCHOOL_ADMIN", "COORDINATOR"].includes(membership.role)) {
    teacherId = p.teacherId || user.id;

    if (p.teacherId) {
      const teacher = await db.membership.findFirst({
        where: {
          organizationId: org.id,
          userId: p.teacherId,
          role: "TEACHER",
        },
      });
      if (!teacher) throw new Error("Professor inválido para esta escola.");
    }
  }

  const lesson = await db.lesson.create({
    data: {
      classGroupId: group.id,
      subjectId: subject.id,
      teacherId,
      title: p.title,
      content: p.content || null,
      homework: p.homework || null,
      lessonDate: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Lesson",
      entityId: lesson.id,
    },
  });

  revalidatePath("/dashboard/diarios");
  revalidatePath("/dashboard");
}

export async function markAttendanceAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const p = z
    .object({
      lessonId: z.string().min(1),
      studentId: z.string().min(1),
      status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
    })
    .parse({
      lessonId: String(fd.get("lessonId") ?? ""),
      studentId: String(fd.get("studentId") ?? ""),
      status: String(fd.get("status") ?? ""),
    });

  const lesson = await db.lesson.findFirst({
    where: {
      id: p.lessonId,
      classGroup: { organizationId: org.id },
      subject: { organizationId: org.id },
    },
  });

  if (!lesson) throw new Error("Aula inválida.");

  await assertTeacherScope({
    actorId: user.id,
    organizationId: org.id,
    classGroupId: lesson.classGroupId,
    subjectId: lesson.subjectId,
  });

  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId: p.studentId,
      classGroupId: lesson.classGroupId,
      active: true,
      student: { organizationId: org.id, active: true },
    },
  });

  if (!enrollment) {
    throw new Error("Aluno não está matriculado nesta turma.");
  }

  const attendance = await db.attendance.upsert({
    where: {
      lessonId_studentId: {
        lessonId: lesson.id,
        studentId: p.studentId,
      },
    },
    update: { status: p.status },
    create: {
      lessonId: lesson.id,
      studentId: p.studentId,
      status: p.status,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "Attendance",
      entityId: attendance.id,
    },
  });

  revalidatePath("/dashboard/frequencia");
}

export async function createGradeAction(fd: FormData) {
  await assertTrustedMutationOrigin();
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
      label: z.string().min(1),
      value: z.coerce.number().min(0).max(100),
      maxValue: z.coerce.number().positive().max(100),
      weight: z.coerce.number().positive().max(100),
    })
    .parse({
      studentId: String(fd.get("studentId") ?? ""),
      subjectId: String(fd.get("subjectId") ?? ""),
      period: String(fd.get("period") ?? "").trim(),
      label: String(fd.get("label") ?? "").trim(),
      value: fd.get("value"),
      maxValue: fd.get("maxValue") || 10,
      weight: fd.get("weight") || 1,
    });

  if (p.value > p.maxValue) {
    throw new Error("A nota não pode exceder o valor máximo.");
  }

  const [student, subject, year] = await Promise.all([
    db.student.findFirst({
      where: { id: p.studentId, organizationId: org.id, active: true },
      include: {
        enrollments: {
          where: {
            active: true,
            classGroup: { organizationId: org.id },
          },
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

  if (!student || !subject) throw new Error("Aluno ou disciplina inválida.");

  const relevantEnrollment = student.enrollments.find(
    (enrollment) => !year || enrollment.classGroup.schoolYearId === year.id,
  );

  if (!relevantEnrollment) {
    throw new Error("Aluno não possui matrícula ativa no ano letivo atual.");
  }

  await assertTeacherScope({
    actorId: user.id,
    organizationId: org.id,
    classGroupId: relevantEnrollment.classGroupId,
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

    if (!academicPeriod) {
      throw new Error("Período acadêmico inválido.");
    }

    if (
      await db.periodClosure.findUnique({
        where: {
          organizationId_schoolYearId_period: {
            organizationId: org.id,
            schoolYearId: year.id,
            period: p.period,
          },
        },
      })
    ) {
      throw new Error("Este período já está fechado para lançamento de notas.");
    }
  }

  const grade = await db.grade.create({
    data: {
      ...p,
      authorId: user.id,
      schoolYearId: year?.id ?? null,
      classGroupId: relevantEnrollment.classGroupId,
      academicPeriodId: academicPeriod?.id ?? null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Grade",
      entityId: grade.id,
    },
  });

  revalidatePath("/dashboard/notas");
}

export async function closePeriodAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const period = z.string().min(1).parse(String(fd.get("period") ?? "").trim());
  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) throw new Error("Nenhum ano letivo ativo.");

  const academicPeriod = await db.academicPeriod.findFirst({
    where: {
      organizationId: org.id,
      schoolYearId: year.id,
      name: period,
    },
  });

  if (!academicPeriod) {
    throw new Error("Período acadêmico não pertence ao ano letivo ativo.");
  }

  const closure = await db.periodClosure.upsert({
    where: {
      organizationId_schoolYearId_period: {
        organizationId: org.id,
        schoolYearId: year.id,
        period,
      },
    },
    update: {
      closedAt: new Date(),
      closedById: user.id,
    },
    create: {
      organizationId: org.id,
      schoolYearId: year.id,
      period,
      closedById: user.id,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CLOSE",
      entity: "AcademicPeriod",
      entityId: closure.id,
      metadata: { period },
    },
  });

  revalidatePath("/dashboard/boletins");
  revalidatePath("/dashboard/notas");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission, requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

function averageGrade(
  rows: { value: unknown; maxValue: unknown; weight: unknown }[],
) {
  const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight), 0);
  if (!totalWeight) return 0;

  return (
    rows.reduce(
      (sum, row) =>
        sum +
        ((Number(row.value) / Number(row.maxValue)) * 10) *
          Number(row.weight),
      0,
    ) / totalWeight
  );
}

function attendancePercent(
  rows: { status: string }[],
) {
  if (!rows.length) return 100;
  const attended = rows.filter((row) =>
    ["PRESENT", "LATE", "EXCUSED"].includes(row.status),
  ).length;
  return (attended / rows.length) * 100;
}

export async function notifyTeacherAcademicPendingAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const p = z.object({
    classSubjectId: z.string().min(1),
    message: z.string().min(5).max(1000),
  }).parse({
    classSubjectId: String(fd.get("classSubjectId") ?? ""),
    message: String(fd.get("message") ?? "").trim(),
  });

  const link = await db.classSubject.findFirst({
    where: {
      id: p.classSubjectId,
      classGroup: { organizationId: org.id },
      subject: { organizationId: org.id },
    },
    include: {
      classGroup: true,
      subject: true,
      teacher: true,
    },
  });

  if (!link || !link.teacherId || !link.teacher) {
    throw new Error("Vínculo docente inválido.");
  }

  await db.$transaction([
    db.notification.create({
      data: {
        organizationId: org.id,
        userId: link.teacherId,
        type: "ACADEMIC_PENDING",
        title: "Pendência acadêmica · " + link.classGroup.name,
        body: link.subject.name + ": " + p.message,
        href: "/dashboard/operacao-academica",
      },
    }),
    db.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: "NOTIFY",
        entity: "ClassSubject",
        entityId: link.id,
        metadata: {
          teacherId: link.teacherId,
          message: p.message,
        },
      },
    }),
  ]);

  revalidatePath("/dashboard/operacao-academica");
}

export async function createRiskInterventionAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("pedagogy", "create");

  const p = z.object({
    studentId: z.string().min(1),
    reason: z.string().min(5).max(2000),
    plan: z.string().min(5).max(3000),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    reason: String(fd.get("reason") ?? "").trim(),
    plan: String(fd.get("plan") ?? "").trim(),
  });

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });
  if (!year) throw new Error("Nenhum ano letivo ativo.");

  const student = await db.student.findFirst({
    where: {
      id: p.studentId,
      organizationId: org.id,
      active: true,
      enrollments: {
        some: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
      },
    },
    include: {
      enrollments: {
        where: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
      },
    },
  });

  if (!student) throw new Error("Aluno inválido para o ano letivo atual.");

  const existing = await db.pedagogicalIntervention.findFirst({
    where: {
      organizationId: org.id,
      studentId: student.id,
      status: "ACTIVE",
      reason: p.reason,
    },
  });

  if (existing) {
    throw new Error("Já existe uma intervenção ativa com este motivo.");
  }

  const intervention = await db.pedagogicalIntervention.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      classGroupId: student.enrollments[0]?.classGroupId ?? null,
      createdById: user.id,
      reason: p.reason,
      plan: p.plan,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "PedagogicalIntervention",
      entityId: intervention.id,
      metadata: { source: "ACADEMIC_RISK" },
    },
  });

  revalidatePath("/dashboard/risco-academico");
  revalidatePath("/dashboard/intervencoes");
}

export async function notifyGuardianAcademicRiskAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("pedagogy", "update");

  const p = z.object({
    studentId: z.string().min(1),
    message: z.string().min(5).max(1500),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    message: String(fd.get("message") ?? "").trim(),
  });

  const student = await db.student.findFirst({
    where: {
      id: p.studentId,
      organizationId: org.id,
      active: true,
    },
    include: {
      guardians: true,
    },
  });

  if (!student) throw new Error("Aluno inválido.");
  if (!student.guardians.length) {
    throw new Error("Aluno não possui responsável vinculado ao portal.");
  }

  await db.$transaction(async (tx) => {
    await tx.notification.createMany({
      data: student.guardians.map((guardian) => ({
        organizationId: org.id,
        userId: guardian.userId,
        type: "ACADEMIC_RISK",
        title: "Acompanhamento acadêmico · " + student.name,
        body: p.message,
        href: "/portal",
      })),
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: "NOTIFY",
        entity: "Student",
        entityId: student.id,
        metadata: {
          type: "ACADEMIC_RISK",
          guardianCount: student.guardians.length,
        },
      },
    });
  });

  revalidatePath("/dashboard/risco-academico");
}

export async function calculateAnnualResultsBatchAction() {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });
  if (!year) throw new Error("Nenhum ano letivo ativo.");

  const students = await db.student.findMany({
    where: {
      organizationId: org.id,
      active: true,
      enrollments: {
        some: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
      },
    },
    include: {
      grades: {
        where: {
          OR: [
            { schoolYearId: year.id },
            {
              schoolYearId: null,
              createdAt: {
                gte: year.startsAt,
                lte: year.endsAt,
              },
            },
          ],
        },
      },
      attendance: {
        where: {
          lesson: {
            classGroup: {
              organizationId: org.id,
              schoolYearId: year.id,
            },
          },
        },
      },
    },
  });

  await db.$transaction(async (tx) => {
    for (const student of students) {
      const finalAverage = averageGrade(student.grades);
      const attendance = attendancePercent(student.attendance);

      const status =
        student.grades.length > 0 &&
        finalAverage >= Number(org.passingGrade) &&
        attendance >= org.attendanceWarningPercent
          ? "PROMOTED"
          : "RETAINED";

      await tx.annualResult.upsert({
        where: {
          studentId_schoolYearId: {
            studentId: student.id,
            schoolYearId: year.id,
          },
        },
        update: {
          status,
          finalAverage,
          attendancePercent: attendance,
          notes: "Resultado recalculado em lote.",
        },
        create: {
          organizationId: org.id,
          studentId: student.id,
          schoolYearId: year.id,
          status,
          finalAverage,
          attendancePercent: attendance,
          notes: "Resultado calculado em lote.",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: "BATCH_CALCULATE",
        entity: "AnnualResult",
        entityId: year.id,
        metadata: {
          schoolYearId: year.id,
          studentCount: students.length,
        },
      },
    });
  });

  revalidatePath("/dashboard/fechamento-anual");
  revalidatePath("/dashboard/resultados");
}

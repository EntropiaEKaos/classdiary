"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { retrySerializable } from "@/lib/transaction-retry";
import { requireSchoolRole } from "@/lib/rbac";
import { withPlanCapacity } from "@/lib/plans";

export async function updateStudentProfileAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const p = z.object({
    studentId: z.string().min(1),
    birthDate: z.string().optional(),
    cpf: z.string().optional(),
    rg: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    guardianEmail: z.string().email().optional().or(z.literal("")),
    addressLine: z.string().optional(),
    addressNumber: z.string().optional(),
    addressDistrict: z.string().optional(),
    addressCity: z.string().optional(),
    addressState: z.string().optional(),
    addressZip: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    healthNotes: z.string().optional(),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    birthDate: String(fd.get("birthDate") ?? ""),
    cpf: String(fd.get("cpf") ?? "").trim(),
    rg: String(fd.get("rg") ?? "").trim(),
    guardianName: String(fd.get("guardianName") ?? "").trim(),
    guardianPhone: String(fd.get("guardianPhone") ?? "").trim(),
    guardianEmail: String(fd.get("guardianEmail") ?? "").trim().toLowerCase(),
    addressLine: String(fd.get("addressLine") ?? "").trim(),
    addressNumber: String(fd.get("addressNumber") ?? "").trim(),
    addressDistrict: String(fd.get("addressDistrict") ?? "").trim(),
    addressCity: String(fd.get("addressCity") ?? "").trim(),
    addressState: String(fd.get("addressState") ?? "").trim(),
    addressZip: String(fd.get("addressZip") ?? "").trim(),
    emergencyContactName: String(fd.get("emergencyContactName") ?? "").trim(),
    emergencyContactPhone: String(fd.get("emergencyContactPhone") ?? "").trim(),
    healthNotes: String(fd.get("healthNotes") ?? "").trim(),
  });

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id },
  });
  if (!student) throw new Error("Aluno inválido.");

  await db.student.update({
    where: { id: student.id },
    data: {
      birthDate: p.birthDate ? new Date(p.birthDate) : null,
      cpf: p.cpf || null,
      rg: p.rg || null,
      guardianName: p.guardianName || null,
      guardianPhone: p.guardianPhone || null,
      guardianEmail: p.guardianEmail || null,
      addressLine: p.addressLine || null,
      addressNumber: p.addressNumber || null,
      addressDistrict: p.addressDistrict || null,
      addressCity: p.addressCity || null,
      addressState: p.addressState || null,
      addressZip: p.addressZip || null,
      emergencyContactName: p.emergencyContactName || null,
      emergencyContactPhone: p.emergencyContactPhone || null,
      healthNotes: p.healthNotes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPDATE",
      entity: "StudentProfile",
      entityId: student.id,
    },
  });

  revalidatePath(`/dashboard/alunos/${student.id}`);
}

export async function upsertStudentDocumentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const p = z.object({
    studentId: z.string().min(1),
    code: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(["PENDING", "RECEIVED", "WAIVED"]),
    fileUrl: z.string().url().optional().or(z.literal("")),
    notes: z.string().optional(),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    code: String(fd.get("code") ?? "").trim().toUpperCase(),
    label: String(fd.get("label") ?? "").trim(),
    status: String(fd.get("status") ?? "PENDING"),
    fileUrl: String(fd.get("fileUrl") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id },
  });
  if (!student) throw new Error("Aluno inválido.");

  const item = await db.studentDocumentRequirement.upsert({
    where: { studentId_code: { studentId: student.id, code: p.code } },
    update: {
      label: p.label,
      status: p.status,
      fileUrl: p.fileUrl || null,
      notes: p.notes || null,
      receivedAt: p.status === "RECEIVED" ? new Date() : null,
    },
    create: {
      organizationId: org.id,
      studentId: student.id,
      code: p.code,
      label: p.label,
      status: p.status,
      fileUrl: p.fileUrl || null,
      notes: p.notes || null,
      receivedAt: p.status === "RECEIVED" ? new Date() : null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPSERT",
      entity: "StudentDocumentRequirement",
      entityId: item.id,
    },
  });

  revalidatePath(`/dashboard/alunos/${student.id}`);
}

export async function transferStudentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const p = z.object({
    studentId: z.string().min(1),
    toClassGroupId: z.string().min(1),
    notes: z.string().optional(),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    toClassGroupId: String(fd.get("toClassGroupId") ?? ""),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id },
  });
  const target = await db.classGroup.findFirst({
    where: { id: p.toClassGroupId, organizationId: org.id },
  });
  if (!student || !target) throw new Error("Aluno ou turma inválida.");

  const current = await db.enrollment.findFirst({
    where: {
      studentId: student.id,
      active: true,
      classGroup: {
        organizationId: org.id,
        schoolYearId: target.schoolYearId,
      },
    },
    include: { classGroup: true },
    orderBy: { createdAt: "desc" },
  });

  await retrySerializable(() => db.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: {
        studentId: student.id,
        active: true,
        classGroup: {
          organizationId: org.id,
          schoolYearId: target.schoolYearId,
        },
        NOT: { classGroupId: target.id },
      },
      data: { active: false },
    });

    await tx.enrollment.upsert({
      where: {
        studentId_classGroupId: {
          studentId: student.id,
          classGroupId: target.id,
        },
      },
      update: { active: true },
      create: {
        studentId: student.id,
        classGroupId: target.id,
        active: true,
      },
    });

    await tx.academicMovement.create({
      data: {
        organizationId: org.id,
        studentId: student.id,
        type: "TRANSFER",
        fromClassGroupId: current?.classGroupId ?? null,
        toClassGroupId: target.id,
        notes: p.notes || null,
      },
    });
  }, { isolationLevel: "Serializable" }));

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "TRANSFER",
      entity: "Student",
      entityId: student.id,
      metadata: {
        fromClassGroupId: current?.classGroupId ?? null,
        toClassGroupId: target.id,
      },
    },
  });

  revalidatePath("/dashboard/matriculas");
  revalidatePath(`/dashboard/alunos/${student.id}`);
}

export async function reenrollStudentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const p = z.object({
    studentId: z.string().min(1),
    classGroupId: z.string().min(1),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    classGroupId: String(fd.get("classGroupId") ?? ""),
  });

  const [student, target] = await Promise.all([
    db.student.findFirst({ where: { id: p.studentId, organizationId: org.id } }),
    db.classGroup.findFirst({ where: { id: p.classGroupId, organizationId: org.id } }),
  ]);
  if (!student || !target) throw new Error("Aluno ou turma inválida.");

  const { enrollment, movement } = await retrySerializable(() => db.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: {
        studentId: student.id,
        active: true,
        classGroup: {
          organizationId: org.id,
          schoolYearId: target.schoolYearId,
        },
        NOT: { classGroupId: target.id },
      },
      data: { active: false },
    });

    const enrollment = await tx.enrollment.upsert({
      where: {
        studentId_classGroupId: {
          studentId: student.id,
          classGroupId: target.id,
        },
      },
      update: { active: true },
      create: {
        studentId: student.id,
        classGroupId: target.id,
        active: true,
      },
    });

    const movement = await tx.academicMovement.create({
      data: {
        organizationId: org.id,
        studentId: student.id,
        type: "REENROLLMENT",
        toClassGroupId: target.id,
        notes: "Rematrícula realizada pela secretaria.",
      },
    });

    return { enrollment, movement };
  }, { isolationLevel: "Serializable" }));

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "REENROLL",
      entity: "Enrollment",
      entityId: enrollment.id,
      metadata: { movementId: movement.id },
    },
  });

  revalidatePath("/dashboard/rematricula");
}

export async function calculateAnnualResultAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const studentId = z.string().min(1).parse(String(fd.get("studentId") ?? ""));
  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });
  if (!year) throw new Error("Ano letivo ativo não encontrado.");

  const student = await db.student.findFirst({
    where: { id: studentId, organizationId: org.id },
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
  if (!student) throw new Error("Aluno inválido.");

  const weightedGradeTotal = student.grades.reduce(
    (sum, grade) =>
      sum +
      ((Number(grade.value) / Number(grade.maxValue)) * 10) *
        Number(grade.weight),
    0,
  );
  const totalWeight = student.grades.reduce(
    (sum, grade) => sum + Number(grade.weight),
    0,
  );
  const finalAverage = totalWeight ? weightedGradeTotal / totalWeight : 0;

  const attendanceTotal = student.attendance.length;
  const attendancePresent = student.attendance.filter(
    (entry) =>
      entry.status === "PRESENT" ||
      entry.status === "LATE" ||
      entry.status === "EXCUSED",
  ).length;
  const attendancePercent = attendanceTotal
    ? (attendancePresent / attendanceTotal) * 100
    : 100;

  const status =
    finalAverage >= Number(org.passingGrade) &&
    attendancePercent >= org.attendanceWarningPercent
      ? "PROMOTED"
      : "RETAINED";

  const result = await db.annualResult.upsert({
    where: {
      studentId_schoolYearId: {
        studentId: student.id,
        schoolYearId: year.id,
      },
    },
    update: {
      status,
      finalAverage,
      attendancePercent,
    },
    create: {
      organizationId: org.id,
      studentId: student.id,
      schoolYearId: year.id,
      status,
      finalAverage,
      attendancePercent,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CALCULATE",
      entity: "AnnualResult",
      entityId: result.id,
      metadata: {
        status,
        finalAverage,
        attendancePercent,
      },
    },
  });

  revalidatePath("/dashboard/resultados");
}

export async function importStudentsCsvAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const raw = z.string().min(1).parse(String(fd.get("csv") ?? ""));
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1001) {
    throw new Error("Importação limitada a 1000 alunos por vez.");
  }

  const rows = lines.slice(1)
    .map((row) => {
      const [name, registration, guardianName, guardianPhone, guardianEmail] =
        row.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
      return { name, registration, guardianName, guardianPhone, guardianEmail };
    })
    .filter((row) => row.name && row.registration);

  const registrations = [...new Set(rows.map((row) => row.registration))];
  const existing = await db.student.findMany({
    where: { organizationId: org.id, registration: { in: registrations } },
    select: { registration: true, active: true },
  });
  const existingMap = new Map(existing.map((student) => [student.registration, student.active]));
  const requested = registrations.filter(
    (registration) => existingMap.get(registration) !== true,
  ).length;

  await withPlanCapacity(
    org.id,
    "students",
    async (tx) => {
      let count = 0;
      for (const row of rows) {
        await tx.student.upsert({
          where: {
            organizationId_registration: {
              organizationId: org.id,
              registration: row.registration,
            },
          },
          update: {
            name: row.name,
            guardianName: row.guardianName || null,
            guardianPhone: row.guardianPhone || null,
            guardianEmail: row.guardianEmail || null,
            active: true,
          },
          create: {
            organizationId: org.id,
            name: row.name,
            registration: row.registration,
            guardianName: row.guardianName || null,
            guardianPhone: row.guardianPhone || null,
            guardianEmail: row.guardianEmail || null,
          },
        });
        count += 1;
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          action: "IMPORT",
          entity: "Student",
          metadata: { imported: count, newStudents: requested },
        },
      });
      return count;
    },
    requested,
  );

  revalidatePath("/dashboard/importar-alunos");
  revalidatePath("/dashboard/alunos");
}

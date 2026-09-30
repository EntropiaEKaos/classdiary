"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function createOccurrenceAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const p = z.object({
    studentId: z.string().min(1),
    title: z.string().min(2),
    description: z.string().min(2),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    severity: String(fd.get("severity") ?? "MEDIUM"),
  });

  const student = await db.student.findFirst({
    where: {
      id: p.studentId,
      organizationId: org.id,
      active: true,
    },
    include: {
      enrollments: {
        where: { active: true },
        include: {
          classGroup: {
            include: { classSubjects: true },
          },
        },
      },
    },
  });

  if (!student) throw new Error("Aluno inválido.");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) =>
      ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
    );

  if (
    teacherOnly &&
    !student.enrollments.some((enrollment) =>
      enrollment.classGroup.classSubjects.some(
        (subject) => subject.teacherId === user.id,
      ),
    )
  ) {
    throw new Error("Professor sem vínculo com este aluno.");
  }

  const occurrence = await db.occurrence.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      authorId: user.id,
      title: p.title,
      description: p.description,
      severity: p.severity,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Occurrence",
      entityId: occurrence.id,
    },
  });

  revalidatePath("/dashboard/ocorrencias");
}

export async function createEventAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z.object({
    title: z.string().min(2),
    startsAt: z.string().min(1),
    description: z.string().optional(),
    audience: z.enum(["ALL", "STAFF", "STUDENTS", "GUARDIANS"]),
  }).parse({
    title: String(fd.get("title") ?? "").trim(),
    startsAt: String(fd.get("startsAt") ?? ""),
    description: String(fd.get("description") ?? "").trim(),
    audience: String(fd.get("audience") ?? "ALL"),
  });

  const startsAt = new Date(p.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Data do evento inválida.");
  }

  const event = await db.academicEvent.create({
    data: {
      organizationId: org.id,
      title: p.title,
      description: p.description || null,
      startsAt,
      audience: p.audience,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "AcademicEvent",
      entityId: event.id,
    },
  });

  revalidatePath("/dashboard/calendario");
}

export async function createAnnouncementAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const p = z.object({
    title: z.string().min(2),
    body: z.string().min(2),
    audience: z.enum(["ALL", "STAFF", "STUDENTS", "GUARDIANS"]),
  }).parse({
    title: String(fd.get("title") ?? "").trim(),
    body: String(fd.get("body") ?? "").trim(),
    audience: String(fd.get("audience") ?? "ALL"),
  });

  const announcement = await db.announcement.create({
    data: {
      organizationId: org.id,
      title: p.title,
      body: p.body,
      audience: p.audience,
      publishedAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Announcement",
      entityId: announcement.id,
    },
  });

  revalidatePath("/dashboard/comunicados");
}

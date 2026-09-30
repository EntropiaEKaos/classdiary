"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export async function updateAcademicSettingsAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const p = z.object({
    timezone: z.string().min(1),
    passingGrade: z.coerce.number().min(0).max(10),
    attendanceWarningPercent: z.coerce.number().int().min(1).max(100),
  }).parse({
    timezone: String(fd.get("timezone") ?? "").trim(),
    passingGrade: fd.get("passingGrade"),
    attendanceWarningPercent: fd.get("attendanceWarningPercent"),
  });

  await db.organization.update({
    where: { id: org.id },
    data: p,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPDATE",
      entity: "AcademicSettings",
      entityId: org.id,
      metadata: p,
    },
  });

  revalidatePath("/dashboard/configuracoes");
  revalidatePath("/dashboard/relatorios");
}

export async function createAcademicPeriodAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR"]);

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });
  if (!year) throw new Error("Nenhum ano letivo ativo.");

  const p = z.object({
    name: z.string().min(1),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    order: z.coerce.number().int().min(1).max(20),
  }).parse({
    name: String(fd.get("name") ?? "").trim(),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
    order: fd.get("order"),
  });

  const startsAt = new Date(p.startsAt);
  const endsAt = new Date(p.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Datas do período inválidas.");
  }

  if (endsAt <= startsAt) {
    throw new Error("A data final do período deve ser posterior à data inicial.");
  }

  if (startsAt < year.startsAt || endsAt > year.endsAt) {
    throw new Error("O período deve estar dentro do ano letivo ativo.");
  }

  const period = await db.academicPeriod.create({
    data: {
      organizationId: org.id,
      schoolYearId: year.id,
      name: p.name,
      startsAt,
      endsAt,
      order: p.order,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "AcademicPeriod",
      entityId: period.id,
    },
  });

  revalidatePath("/dashboard/configuracoes");
}

export async function createTimetableEntryAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const p = z.object({
    classGroupId: z.string().min(1),
    subjectId: z.string().min(1),
    teacherId: z.string().optional(),
    weekday: z.coerce.number().int().min(1).max(7),
    startsAt: z.string().regex(/^\d{2}:\d{2}$/),
    endsAt: z.string().regex(/^\d{2}:\d{2}$/),
  }).parse({
    classGroupId: String(fd.get("classGroupId") ?? ""),
    subjectId: String(fd.get("subjectId") ?? ""),
    teacherId: String(fd.get("teacherId") ?? "") || undefined,
    weekday: fd.get("weekday"),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
  });

  if (p.startsAt >= p.endsAt) throw new Error("O horário final deve ser maior que o inicial.");

  const [group, subject, classSubject] = await Promise.all([
    db.classGroup.findFirst({ where: { id: p.classGroupId, organizationId: org.id } }),
    db.subject.findFirst({ where: { id: p.subjectId, organizationId: org.id } }),
    db.classSubject.findFirst({
      where: {
        classGroupId: p.classGroupId,
        subjectId: p.subjectId,
        classGroup: { organizationId: org.id },
        subject: { organizationId: org.id },
      },
    }),
  ]);
  if (!group || !subject) throw new Error("Turma ou disciplina inválida.");
  if (!classSubject) {
    throw new Error("Vincule a disciplina à turma antes de criar o horário.");
  }

  if (p.teacherId) {
    const teacher = await db.membership.findFirst({
      where: {
        organizationId: org.id,
        userId: p.teacherId,
        role: "TEACHER",
      },
    });
    if (!teacher) throw new Error("Professor inválido para esta escola.");
    if (classSubject.teacherId && classSubject.teacherId !== p.teacherId) {
      throw new Error("O professor não corresponde ao vínculo da turma/disciplina.");
    }
  }

  const conflict = await db.timetableEntry.findFirst({
    where: {
      organizationId: org.id,
      weekday: p.weekday,
      startsAt: { lt: p.endsAt },
      endsAt: { gt: p.startsAt },
      OR: [
        { classGroupId: group.id },
        ...(p.teacherId ? [{ teacherId: p.teacherId }] : []),
      ],
    },
  });

  if (conflict) {
    throw new Error("Existe conflito de horário para a turma ou professor.");
  }

  const entry = await db.timetableEntry.create({
    data: {
      organizationId: org.id,
      classGroupId: group.id,
      subjectId: subject.id,
      teacherId: p.teacherId || null,
      weekday: p.weekday,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "TimetableEntry",
      entityId: entry.id,
    },
  });

  revalidatePath("/dashboard/horarios");
}

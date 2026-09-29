import { PrismaClient } from "../generated/prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "admin@classdiary.local";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hash(ownerPassword, 12);

  const platform = await db.organization.upsert({
    where: { slug: "classdiary-platform" },
    update: { active: true },
    create: {
      name: "ClassDiary Platform",
      slug: "classdiary-platform",
      active: true,
      subscription: { create: { plan: "INTERNAL", status: "ACTIVE", seats: 5 } },
    },
  });

  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    update: { name: "Administrador ClassDiary", passwordHash, active: true },
    create: { name: "Administrador ClassDiary", email: ownerEmail, passwordHash, active: true },
  });

  await db.membership.upsert({
    where: { organizationId_userId_role: { organizationId: platform.id, userId: owner.id, role: "PLATFORM_OWNER" } },
    update: {},
    create: { organizationId: platform.id, userId: owner.id, role: "PLATFORM_OWNER" },
  });

  const school = await db.organization.upsert({
    where: { slug: "escola-demo" },
    update: { active: true },
    create: {
      name: "Escola Demo ClassDiary",
      slug: "escola-demo",
      email: "contato@escolademo.local",
      active: true,
      subscription: {
        create: {
          plan: "PRO",
          status: "TRIAL",
          seats: 100,
          trialEndsAt: new Date(Date.now() + 14 * 86400000),
        },
      },
    },
  });

  await db.membership.upsert({
    where: { organizationId_userId_role: { organizationId: school.id, userId: owner.id, role: "SCHOOL_ADMIN" } },
    update: {},
    create: { organizationId: school.id, userId: owner.id, role: "SCHOOL_ADMIN" },
  });

  const year = await db.schoolYear.upsert({
    where: { organizationId_name: { organizationId: school.id, name: "2026" } },
    update: { active: true },
    create: {
      organizationId: school.id,
      name: "2026",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-31T23:59:59.000Z"),
      active: true,
    },
  });

  const classGroup = await db.classGroup.upsert({
    where: { organizationId_schoolYearId_name: { organizationId: school.id, schoolYearId: year.id, name: "7º Ano A" } },
    update: {},
    create: {
      organizationId: school.id,
      schoolYearId: year.id,
      name: "7º Ano A",
      gradeLevel: "7º Ano",
      shift: "Manhã",
      room: "Sala 7",
    },
  });

  const subject = await db.subject.upsert({
    where: { organizationId_name: { organizationId: school.id, name: "Matemática" } },
    update: {},
    create: { organizationId: school.id, name: "Matemática", code: "MAT" },
  });

  const teacher = await db.user.upsert({
    where: { email: "professor@escolademo.local" },
    update: { name: "Professor Demo", active: true },
    create: { name: "Professor Demo", email: "professor@escolademo.local", active: true },
  });

  await db.membership.upsert({
    where: { organizationId_userId_role: { organizationId: school.id, userId: teacher.id, role: "TEACHER" } },
    update: {},
    create: { organizationId: school.id, userId: teacher.id, role: "TEACHER" },
  });

  await db.classSubject.upsert({
    where: { classGroupId_subjectId: { classGroupId: classGroup.id, subjectId: subject.id } },
    update: { teacherId: teacher.id },
    create: { classGroupId: classGroup.id, subjectId: subject.id, teacherId: teacher.id },
  });

  const student = await db.student.upsert({
    where: { organizationId_registration: { organizationId: school.id, registration: "DEMO-001" } },
    update: { active: true },
    create: {
      organizationId: school.id,
      name: "Aluno Demo",
      registration: "DEMO-001",
      guardianName: "Responsável Demo",
      guardianPhone: "(13) 99999-0000",
      active: true,
    },
  });

  await db.enrollment.upsert({
    where: { studentId_classGroupId: { studentId: student.id, classGroupId: classGroup.id } },
    update: { active: true },
    create: { studentId: student.id, classGroupId: classGroup.id, active: true },
  });

  console.log("Seed concluído.");
  console.log("Admin:", ownerEmail);
  console.log("Senha de demonstração:", ownerPassword);
  console.log("Escola:", school.name);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

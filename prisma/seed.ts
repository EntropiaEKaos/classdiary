import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurada para o seed.");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "admin@edusync.local";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hash(ownerPassword, 12);

  const platform = await db.organization.upsert({
    where: { slug: "edusync-platform" },
    update: { active: true },
    create: {
      name: "EduSync Platform",
      slug: "edusync-platform",
      active: true,
      subscription: { create: { plan: "INTERNAL", status: "ACTIVE", seats: 5 } },
    },
  });

  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    update: { name: "Administrador EduSync", passwordHash, active: true },
    create: {
      name: "Administrador EduSync",
      email: ownerEmail,
      passwordHash,
      active: true,
    },
  });

  await db.membership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: platform.id,
        userId: owner.id,
        role: "PLATFORM_OWNER",
      },
    },
    update: {},
    create: {
      organizationId: platform.id,
      userId: owner.id,
      role: "PLATFORM_OWNER",
    },
  });

  const school = await db.organization.upsert({
    where: { slug: "escola-demo" },
    update: { active: true },
    create: {
      name: "Escola Demo EduSync",
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
    where: {
      organizationId_userId_role: {
        organizationId: school.id,
        userId: owner.id,
        role: "SCHOOL_ADMIN",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      userId: owner.id,
      role: "SCHOOL_ADMIN",
    },
  });

  const year = await db.schoolYear.upsert({
    where: {
      organizationId_name: {
        organizationId: school.id,
        name: "2026",
      },
    },
    update: { active: true },
    create: {
      organizationId: school.id,
      name: "2026",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-31T23:59:59.000Z"),
      active: true,
    },
  });

  await db.academicPeriod.upsert({
    where: {
      organizationId_schoolYearId_name: {
        organizationId: school.id,
        schoolYearId: year.id,
        name: "Período E2E Base",
      },
    },
    update: {
      active: true,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-30T23:59:59.000Z"),
      order: 1,
    },
    create: {
      organizationId: school.id,
      schoolYearId: year.id,
      name: "Período E2E Base",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-30T23:59:59.000Z"),
      order: 1,
      active: true,
    },
  });

  const classGroup = await db.classGroup.upsert({
    where: {
      organizationId_schoolYearId_name: {
        organizationId: school.id,
        schoolYearId: year.id,
        name: "7º Ano A",
      },
    },
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

  await db.classGroup.upsert({
    where: {
      organizationId_schoolYearId_name: {
        organizationId: school.id,
        schoolYearId: year.id,
        name: "7º Ano B",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      schoolYearId: year.id,
      name: "7º Ano B",
      gradeLevel: "7º Ano",
      shift: "Manhã",
      room: "Sala 8",
    },
  });

  const subject = await db.subject.upsert({
    where: {
      organizationId_name: {
        organizationId: school.id,
        name: "Matemática",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      name: "Matemática",
      code: "MAT",
    },
  });

  const rolePassword = process.env.SEED_ROLE_PASSWORD ?? "RoleDemo123!";
  const rolePasswordHash = await hash(rolePassword, 12);

  const teacher = await db.user.upsert({
    where: { email: "professor@escolademo.local" },
    update: { name: "Professor Demo", passwordHash: rolePasswordHash, active: true },
    create: {
      name: "Professor Demo",
      email: "professor@escolademo.local",
      passwordHash: rolePasswordHash,
      active: true,
    },
  });

  await db.membership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: school.id,
        userId: teacher.id,
        role: "TEACHER",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      userId: teacher.id,
      role: "TEACHER",
    },
  });

  const secretary = await db.user.upsert({
    where: { email: "secretaria@escolademo.local" },
    update: { name: "Secretaria Demo", passwordHash: rolePasswordHash, active: true },
    create: {
      name: "Secretaria Demo",
      email: "secretaria@escolademo.local",
      passwordHash: rolePasswordHash,
      active: true,
    },
  });

  await db.membership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: school.id,
        userId: secretary.id,
        role: "SECRETARY",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      userId: secretary.id,
      role: "SECRETARY",
    },
  });

  await db.classSubject.upsert({
    where: {
      classGroupId_subjectId: {
        classGroupId: classGroup.id,
        subjectId: subject.id,
      },
    },
    update: { teacherId: teacher.id },
    create: {
      classGroupId: classGroup.id,
      subjectId: subject.id,
      teacherId: teacher.id,
    },
  });

  const student = await db.student.upsert({
    where: {
      organizationId_registration: {
        organizationId: school.id,
        registration: "DEMO-001",
      },
    },
    update: { active: true },
    create: {
      id: "e2e-demo-student",
      organizationId: school.id,
      name: "Aluno Demo",
      registration: "DEMO-001",
      guardianName: "Responsável Demo",
      guardianPhone: "(13) 99999-0000",
      active: true,
    },
  });

  await db.enrollment.upsert({
    where: {
      studentId_classGroupId: {
        studentId: student.id,
        classGroupId: classGroup.id,
      },
    },
    update: { active: true },
    create: {
      studentId: student.id,
      classGroupId: classGroup.id,
      active: true,
    },
  });

  const studentUser = await db.user.upsert({
    where: { email: "aluno@escolademo.local" },
    update: { name: "Aluno Demo", passwordHash: rolePasswordHash, active: true },
    create: {
      name: "Aluno Demo",
      email: "aluno@escolademo.local",
      passwordHash: rolePasswordHash,
      active: true,
    },
  });

  await db.membership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: school.id,
        userId: studentUser.id,
        role: "STUDENT",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      userId: studentUser.id,
      role: "STUDENT",
    },
  });

  await db.studentUser.upsert({
    where: {
      studentId_userId: {
        studentId: student.id,
        userId: studentUser.id,
      },
    },
    update: {},
    create: {
      studentId: student.id,
      userId: studentUser.id,
    },
  });

  const guardianUser = await db.user.upsert({
    where: { email: "responsavel@escolademo.local" },
    update: { name: "Responsável Demo", passwordHash: rolePasswordHash, active: true },
    create: {
      name: "Responsável Demo",
      email: "responsavel@escolademo.local",
      passwordHash: rolePasswordHash,
      active: true,
    },
  });

  await db.membership.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: school.id,
        userId: guardianUser.id,
        role: "GUARDIAN",
      },
    },
    update: {},
    create: {
      organizationId: school.id,
      userId: guardianUser.id,
      role: "GUARDIAN",
    },
  });

  await db.studentGuardian.upsert({
    where: {
      studentId_userId: {
        studentId: student.id,
        userId: guardianUser.id,
      },
    },
    update: { relation: "Responsável" },
    create: {
      studentId: student.id,
      userId: guardianUser.id,
      relation: "Responsável",
    },
  });

  const foreignOrg = await db.organization.upsert({
    where: { slug: "escola-isolada-e2e" },
    update: { active: true },
    create: {
      id: "e2e-other-org",
      name: "Escola Isolada E2E",
      slug: "escola-isolada-e2e",
      active: true,
    },
  });

  await db.student.upsert({
    where: {
      organizationId_registration: {
        organizationId: foreignOrg.id,
        registration: "E2E-FOREIGN-001",
      },
    },
    update: { active: true },
    create: {
      id: "e2e-other-student",
      organizationId: foreignOrg.id,
      name: "Aluno Outro Tenant E2E",
      registration: "E2E-FOREIGN-001",
      active: true,
    },
  });

  console.log("Seed concluído.");
  console.log("Admin:", ownerEmail);
  console.log("Senha de demonstração:", ownerPassword);
  console.log("Senha dos perfis E2E:", rolePassword);
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

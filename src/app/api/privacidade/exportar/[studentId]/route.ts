import { NextResponse } from "next/server";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { registerSensitiveAccess } from "@/lib/privacy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) {
    return NextResponse.json(
      { error: "Sem escola ativa." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { studentId } = await params;

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const privileged = roles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR"].includes(role),
  );

  const student = await db.student.findFirst({
    where: {
      id: studentId,
      organizationId: org.id,
      ...(privileged
        ? {}
        : {
            OR: [
              { userLinks: { some: { userId: user.id } } },
              { guardians: { some: { userId: user.id } } },
            ],
          }),
    },
    include: {
      enrollments: {
        include: {
          classGroup: {
            include: { schoolYear: true },
          },
        },
      },
      grades: {
        include: {
          subject: true,
          academicPeriod: true,
          schoolYear: true,
        },
      },
      recoveryGrades: {
        include: {
          subject: true,
          academicPeriod: true,
          schoolYear: true,
        },
      },
      attendance: {
        include: {
          lesson: {
            include: {
              subject: true,
              classGroup: true,
            },
          },
          justification: true,
        },
      },
      occurrences: true,
      documents: true,
      documentRequirements: true,
      academicMovements: true,
      annualResults: {
        include: { schoolYear: true },
      },
      contracts: true,
      invoices: true,
      payments: true,
      receipts: true,
      medicalRecords: true,
      guardianAuthorizations: true,
      pedagogicalInterventions: true,
      competencyAssessments: true,
      pedagogicalObservations: true,
      guardianMeetings: true,
      followUpPlans: true,
      examAttempts: true,
      dataSubjectRequests: true,
      privacyConsents: true,
    },
  });

  if (!student) {
    return NextResponse.json(
      { error: "Aluno não encontrado ou sem autorização." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  await registerSensitiveAccess(
    org.id,
    user.id,
    "STUDENT_DATA_EXPORT",
    {
      studentId: student.id,
      resourceId: student.id,
      purpose: "Exportação de dados do titular",
    },
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    organization: {
      id: org.id,
      name: org.name,
    },
    student,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition":
        `attachment; filename="classdiary-dados-${student.registration}.json"`,
    },
  });
}

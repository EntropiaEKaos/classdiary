import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function avg(rows: { value: unknown; maxValue: unknown; weight: unknown }[]) {
  const weight = rows.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (!weight) return 0;

  return (
    rows.reduce(
      (sum, grade) =>
        sum +
        ((Number(grade.value) / Number(grade.maxValue)) * 10) *
          Number(grade.weight),
      0,
    ) / weight
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) {
    return NextResponse.json({ error: "Sem escola ativa." }, { status: 404 });
  }

  const year = await db.schoolYear.findFirst({
    where: { organizationId: org.id, active: true },
  });

  if (!year) {
    return NextResponse.json(
      { error: "Ano letivo ativo não encontrado." },
      { status: 409 },
    );
  }

  const { studentId } = await params;

  const student = await db.student.findFirst({
    where: { id: studentId, organizationId: org.id },
    include: {
      grades: {
        where: {
          OR: [
            { schoolYearId: year.id },
            {
              schoolYearId: null,
              createdAt: { gte: year.startsAt, lte: year.endsAt },
            },
          ],
        },
        include: { subject: true, academicPeriod: true },
      },
      enrollments: {
        where: {
          active: true,
          classGroup: { schoolYearId: year.id },
        },
        include: {
          classGroup: {
            include: {
              classSubjects: true,
            },
          },
        },
      },
      guardians: true,
      userLinks: true,
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
  }

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const privilegedStaff = roles.some((role) =>
    ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(role),
  );

  const teacherAccess =
    roles.includes("TEACHER") &&
    student.enrollments.some((enrollment) =>
      enrollment.classGroup.classSubjects.some(
        (classSubject) => classSubject.teacherId === user.id,
      ),
    );

  const guardianAccess = student.guardians.some(
    (guardian) => guardian.userId === user.id,
  );

  const studentAccess = student.userLinks.some(
    (link) => link.userId === user.id,
  );

  if (!privilegedStaff && !teacherAccess && !guardianAccess && !studentAccess) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;

  const newPage = () => {
    page = pdf.addPage([595, 842]);
    y = 800;
  };

  const draw = (text: string, size = 11, font = regular) => {
    if (y < 70) newPage();

    page.drawText(text.slice(0, 110), {
      x: 45,
      y,
      size,
      font,
      color: rgb(0.08, 0.13, 0.24),
    });
    y -= size + 8;
  };

  draw("ClassDiary - Boletim Escolar", 18, bold);
  draw(org.name, 13, bold);
  draw(`Ano letivo: ${year.name}`);
  draw(`Aluno: ${student.name}`);
  draw(`Matrícula: ${student.registration}`);
  draw(
    `Turma: ${student.enrollments[0]?.classGroup.name ?? "Não vinculada"}`,
  );
  y -= 10;

  const periods = [
    ...new Set(
      student.grades.map(
        (grade) => grade.academicPeriod?.name ?? grade.period,
      ),
    ),
  ];

  if (!periods.length) {
    draw("Sem notas registradas para o ano letivo ativo.", 10);
  }

  for (const period of periods) {
    draw(period, 13, bold);

    const rows = student.grades.filter(
      (grade) => (grade.academicPeriod?.name ?? grade.period) === period,
    );

    const subjects = [
      ...new Map(rows.map((grade) => [grade.subjectId, grade.subject])).values(),
    ];

    for (const subject of subjects) {
      const grades = rows.filter((grade) => grade.subjectId === subject.id);
      draw(
        `${subject.name}: média ${avg(grades).toFixed(2)} (${grades.length} avaliações)`,
      );
    }

    y -= 5;
  }

  draw(`Emitido em: ${new Date().toLocaleDateString("pt-BR")}`, 9);

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="boletim-${student.registration}.pdf"`,
    },
  });
}

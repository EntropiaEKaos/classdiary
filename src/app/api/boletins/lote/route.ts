import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

function avg(rows: { value: unknown; maxValue: unknown; weight: unknown }[]) {
  const total = rows.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (!total) return 0;
  return rows.reduce(
    (sum, grade) =>
      sum +
      ((Number(grade.value) / Number(grade.maxValue)) * 10) *
        Number(grade.weight),
    0,
  ) / total;
}

export async function GET() {
  const { org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "SECRETARY",
  ]);

  const students = await db.student.findMany({
    where: { organizationId: org.id, active: true },
    include: {
      grades: { include: { subject: true } },
      enrollments: {
        where: { active: true },
        include: { classGroup: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const student of students) {
    const page = pdf.addPage([595, 842]);
    let y = 800;

    const draw = (text: string, size = 11, font = regular) => {
      if (y < 70) {
        y = 800;
      }
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
    draw(`Aluno: ${student.name}`);
    draw(`Matrícula: ${student.registration}`);
    draw(`Turma: ${student.enrollments[0]?.classGroup.name ?? "Não vinculada"}`);
    y -= 8;

    const periods = [...new Set(student.grades.map((grade) => grade.period))];

    if (!periods.length) {
      draw("Sem notas registradas.", 10);
    }

    for (const period of periods) {
      draw(period, 13, bold);
      const periodGrades = student.grades.filter(
        (grade) => grade.period === period,
      );
      const subjects = [
        ...new Map(
          periodGrades.map((grade) => [grade.subjectId, grade.subject]),
        ).values(),
      ];

      for (const subject of subjects) {
        const grades = periodGrades.filter(
          (grade) => grade.subjectId === subject.id,
        );
        draw(
          `${subject.name}: média ${avg(grades).toFixed(2)} (${grades.length} avaliações)`,
        );
      }

      y -= 5;
    }

    draw(`Emitido em: ${new Date().toLocaleDateString("pt-BR")}`, 9);
  }

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="classdiary-boletins-lote.pdf"',
    },
  });
}

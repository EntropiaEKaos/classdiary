import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { org } = await requireModulePermission("assessments", "view");
  const { id } = await params;

  const exam = await db.exam.findFirst({
    where: { id, organizationId: org.id },
    include: {
      classGroup: true,
      subject: true,
      academicPeriod: true,
      questions: {
        include: {
          question: true,
          competencies: { include: { competency: true } },
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!exam) {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]);
  let y = 790;

  const newPage = () => {
    page = pdf.addPage([595, 842]);
    y = 790;
  };

  const draw = (text: string, size = 11, font = regular, indent = 0) => {
    const words = text.split(/\s+/).filter(Boolean);
    let line = "";

    const flush = () => {
      if (!line) return;
      if (y < 65) newPage();
      page.drawText(line, {
        x: 48 + indent,
        y,
        size,
        font,
        color: rgb(0.08, 0.13, 0.24),
      });
      y -= size + 7;
      line = "";
    };

    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (candidate.length > 88 - Math.floor(indent / 4)) {
        flush();
        line = word;
      } else {
        line = candidate;
      }
    }
    flush();
  };

  draw(org.name, 15, bold);
  draw(exam.title, 18, bold);
  draw(`Turma: ${exam.classGroup.name} · Disciplina: ${exam.subject.name}`);
  draw(`Período: ${exam.academicPeriod?.name ?? "Não definido"}`);
  if (exam.description) draw(exam.description);
  y -= 8;
  draw("Aluno: _________________________________________________", 11);
  draw("Data: ____/____/________", 11);
  y -= 10;

  for (const item of exam.questions) {
    draw(
      `${item.position}. ${item.question.prompt} (${String(item.points)} ponto(s))`,
      11,
      bold,
    );

    const options = Array.isArray(item.question.options)
      ? item.question.options.map(String)
      : [];

    for (const [index, option] of options.entries()) {
      draw(`${String.fromCharCode(65 + index)}) ${option}`, 10, regular, 12);
    }

    if (item.question.type === "TRUE_FALSE") {
      draw("(   ) Verdadeiro    (   ) Falso", 10, regular, 12);
    }

    if (["SHORT_TEXT", "ESSAY"].includes(item.question.type)) {
      const lines = item.question.type === "ESSAY" ? 8 : 3;
      for (let i = 0; i < lines; i += 1) {
        draw("__________________________________________________________", 10, regular, 12);
      }
    }

    if (item.competencies.length) {
      draw(
        "Habilidade: " +
          item.competencies.map((link) => link.competency.code).join(", "),
        8,
      );
    }

    y -= 10;
  }

  const total = exam.questions.reduce(
    (sum, item) => sum + Number(item.points),
    0,
  );
  draw(`Valor total: ${total.toFixed(2)} pontos`, 11, bold);

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="prova-${exam.id}.pdf"`,
    },
  });
}

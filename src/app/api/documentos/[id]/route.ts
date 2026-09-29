import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) {
    return NextResponse.json({ error: "Sem escola ativa." }, { status: 404 });
  }

  const { id } = await params;

  const document = await db.academicDocument.findFirst({
    where: { id, organizationId: org.id },
    include: {
      student: {
        include: {
          guardians: true,
          userLinks: true,
        },
      },
      organization: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const staff = user.memberships.some(
    (membership) =>
      membership.organizationId === org.id &&
      ["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"].includes(membership.role),
  );

  const guardian = document.student.guardians.some(
    (link) => link.userId === user.id,
  );

  const student = document.student.userLinks.some(
    (link) => link.userId === user.id,
  );

  if (!staff && !guardian && !student) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const payload =
    document.payload && typeof document.payload === "object"
      ? (document.payload as Record<string, unknown>)
      : {};

  const renderedBody =
    typeof payload.renderedBody === "string"
      ? payload.renderedBody
      : document.title;

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 790;

  const drawLine = (text: string, size = 11, font = regular) => {
    if (y < 70) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }

    page.drawText(text, {
      x: 48,
      y,
      size,
      font,
      color: rgb(0.08, 0.13, 0.24),
      maxWidth: 500,
    });

    y -= size + 9;
  };

  drawLine(document.organization.name, 15, bold);
  drawLine(document.title, 18, bold);
  drawLine(`Aluno: ${document.student.name}`, 11);
  drawLine(`Matrícula: ${document.student.registration}`, 11);
  y -= 10;

  for (const paragraph of renderedBody.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";

    for (const word of words) {
      const candidate = line ? line + " " + word : word;

      if (candidate.length > 86) {
        drawLine(line);
        line = word;
      } else {
        line = candidate;
      }
    }

    if (line) drawLine(line);
    y -= 4;
  }

  y -= 16;
  drawLine(
    `Emitido em ${document.createdAt.toLocaleDateString("pt-BR")}`,
    9,
  );

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="documento-${document.id}.pdf"`,
    },
  });
}

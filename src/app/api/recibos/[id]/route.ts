import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModulePermission } from "@/lib/rbac";

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

  const receipt = await db.receipt.findFirst({
    where: {
      id,
      organizationId: org.id,
    },
    include: {
      student: {
        include: {
          guardians: true,
          userLinks: true,
        },
      },
      invoice: true,
      payment: true,
      organization: {
        include: {
          financialSettings: true,
        },
      },
    },
  });

  if (!receipt) {
    return NextResponse.json({ error: "Recibo não encontrado." }, { status: 404 });
  }

  const staff = await hasModulePermission("finance", "view");

  const guardian = receipt.student.guardians.some(
    (link) => link.userId === user.id,
  );

  const student = receipt.student.userLinks.some(
    (link) => link.userId === user.id,
  );

  if (!staff && !guardian && !student) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const settings = receipt.organization.financialSettings;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 790;

  const draw = (text: string, size = 11, font = regular) => {
    page.drawText(text.slice(0, 110), {
      x: 48,
      y,
      size,
      font,
      color: rgb(0.08, 0.13, 0.24),
    });
    y -= size + 10;
  };

  draw("RECIBO DE PAGAMENTO", 20, bold);
  draw(settings?.legalName ?? org.name, 14, bold);
  if (settings?.document) draw(`Documento: ${settings.document}`);
  y -= 8;

  draw(`Recibo nº: ${receipt.number}`, 12, bold);
  draw(`Aluno: ${receipt.student.name}`);
  draw(`Matrícula: ${receipt.student.registration}`);
  draw(`Descrição: ${receipt.description}`);
  draw(`Valor recebido: R$ ${Number(receipt.amount).toFixed(2)}`, 13, bold);
  draw(`Forma de pagamento: ${receipt.payment?.method ?? "Não informada"}`);
  if (receipt.payment?.externalReference) {
    draw(`Referência: ${receipt.payment.externalReference}`);
  }
  draw(`Data: ${receipt.issuedAt.toLocaleString("pt-BR")}`);

  if (settings?.pixKey && receipt.payment?.method === "PIX") {
    y -= 8;
    draw("Pagamento via Pix", 12, bold);
    draw(`Chave: ${settings.pixKey}`);
  }

  y -= 25;
  draw("____________________________________________", 10);
  draw("Responsável financeiro / instituição", 9);

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${receipt.number}.pdf"`,
    "Cache-Control": "private, no-store",
    },
  });
}

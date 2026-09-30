"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission, requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { retrySerializable } from "@/lib/transaction-retry";

function calculateDiscount(
  amount: number,
  type?: string | null,
  value?: number | null,
) {
  if (!type || !value) return 0;
  if (type === "PERCENT") return Math.min(amount, (amount * value) / 100);
  if (type === "FIXED") return Math.min(amount, value);
  return 0;
}

function validDate(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(label + " inválida.");
  }
  return date;
}

export async function updateFinancialSettingsAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    pixKey: z.string().optional(),
    pixKeyType: z.string().optional(),
    legalName: z.string().optional(),
    document: z.string().optional(),
    receiptPrefix: z.string().min(1).max(10),
    defaultDueDay: z.coerce.number().int().min(1).max(28),
    lateFeePercent: z.coerce.number().min(0).max(100),
    monthlyInterestPercent: z.coerce.number().min(0).max(100),
  }).parse({
    pixKey: String(fd.get("pixKey") ?? "").trim(),
    pixKeyType: String(fd.get("pixKeyType") ?? "").trim(),
    legalName: String(fd.get("legalName") ?? "").trim(),
    document: String(fd.get("document") ?? "").trim(),
    receiptPrefix: String(fd.get("receiptPrefix") ?? "REC").trim().toUpperCase(),
    defaultDueDay: fd.get("defaultDueDay"),
    lateFeePercent: fd.get("lateFeePercent"),
    monthlyInterestPercent: fd.get("monthlyInterestPercent"),
  });

  await db.financialSettings.upsert({
    where: { organizationId: org.id },
    update: {
      pixKey: p.pixKey || null,
      pixKeyType: p.pixKeyType || null,
      legalName: p.legalName || null,
      document: p.document || null,
      receiptPrefix: p.receiptPrefix,
      defaultDueDay: p.defaultDueDay,
      lateFeePercent: p.lateFeePercent,
      monthlyInterestPercent: p.monthlyInterestPercent,
    },
    create: {
      organizationId: org.id,
      pixKey: p.pixKey || null,
      pixKeyType: p.pixKeyType || null,
      legalName: p.legalName || null,
      document: p.document || null,
      receiptPrefix: p.receiptPrefix,
      defaultDueDay: p.defaultDueDay,
      lateFeePercent: p.lateFeePercent,
      monthlyInterestPercent: p.monthlyInterestPercent,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPDATE",
      entity: "FinancialSettings",
      entityId: org.id,
    },
  });

  revalidatePath("/dashboard/financeiro/configuracoes");
}

export async function createStudentContractAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("finance", "create");

  const p = z.object({
    studentId: z.string().min(1),
    title: z.string().min(2),
    startsAt: z.string().min(1),
    endsAt: z.string().optional(),
    monthlyAmount: z.coerce.number().positive(),
    discountType: z.enum(["NONE", "PERCENT", "FIXED"]),
    discountValue: z.coerce.number().min(0).optional(),
    scholarshipLabel: z.string().optional(),
    notes: z.string().optional(),
  }).parse({
    studentId: String(fd.get("studentId") ?? ""),
    title: String(fd.get("title") ?? "").trim(),
    startsAt: String(fd.get("startsAt") ?? ""),
    endsAt: String(fd.get("endsAt") ?? ""),
    monthlyAmount: fd.get("monthlyAmount"),
    discountType: String(fd.get("discountType") ?? "NONE"),
    discountValue: fd.get("discountValue") || 0,
    scholarshipLabel: String(fd.get("scholarshipLabel") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  if (p.discountType === "PERCENT" && (p.discountValue ?? 0) > 100) {
    throw new Error("Desconto percentual não pode ultrapassar 100%.");
  }

  const startsAt = validDate(p.startsAt, "Data inicial");
  const endsAt = p.endsAt ? validDate(p.endsAt, "Data final") : null;

  if (endsAt && endsAt < startsAt) {
    throw new Error("Data final anterior ao início do contrato.");
  }

  const student = await db.student.findFirst({
    where: { id: p.studentId, organizationId: org.id, active: true },
  });
  if (!student) throw new Error("Aluno inválido.");

  const contract = await db.studentContract.create({
    data: {
      organizationId: org.id,
      studentId: student.id,
      title: p.title,
      startsAt,
      endsAt,
      monthlyAmount: p.monthlyAmount,
      discountType: p.discountType === "NONE" ? null : p.discountType,
      discountValue: p.discountType === "NONE" ? null : p.discountValue ?? 0,
      scholarshipLabel: p.scholarshipLabel || null,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "StudentContract",
      entityId: contract.id,
    },
  });

  revalidatePath("/dashboard/financeiro/contratos");
}

export async function generateMonthlyInvoiceAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("finance", "create");

  const p = z.object({
    contractId: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
  }).parse({
    contractId: String(fd.get("contractId") ?? ""),
    month: fd.get("month"),
    year: fd.get("year"),
  });

  const [contract, settings] = await Promise.all([
    db.studentContract.findFirst({
      where: {
        id: p.contractId,
        organizationId: org.id,
        status: "ACTIVE",
      },
      include: { student: true },
    }),
    db.financialSettings.findUnique({
      where: { organizationId: org.id },
    }),
  ]);

  if (!contract) throw new Error("Contrato inválido.");

  const baseAmount = Number(contract.monthlyAmount);
  const discount = calculateDiscount(
    baseAmount,
    contract.discountType,
    contract.discountValue ? Number(contract.discountValue) : null,
  );

  const dueDay = settings?.defaultDueDay ?? 10;
  const dueAt = new Date(p.year, p.month - 1, dueDay, 12, 0, 0);
  const reference =
    `${contract.student.registration}-${p.year}-${String(p.month).padStart(2, "0")}`;

  const invoice = await db.invoice.upsert({
    where: {
      organizationId_reference: {
        organizationId: org.id,
        reference,
      },
    },
    update: {
      description: `Mensalidade ${String(p.month).padStart(2, "0")}/${p.year}`,
      dueAt,
      amount: baseAmount,
      discountAmount: discount,
    },
    create: {
      organizationId: org.id,
      studentId: contract.studentId,
      contractId: contract.id,
      reference,
      description: `Mensalidade ${String(p.month).padStart(2, "0")}/${p.year}`,
      dueAt,
      amount: baseAmount,
      discountAmount: discount,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "GENERATE",
      entity: "Invoice",
      entityId: invoice.id,
    },
  });

  revalidatePath("/dashboard/financeiro/cobrancas");
}

export async function registerPaymentAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("finance", "update");

  const p = z.object({
    invoiceId: z.string().min(1),
    amount: z.coerce.number().positive(),
    method: z.enum(["PIX", "CASH", "CARD", "TRANSFER", "OTHER"]),
    externalReference: z.string().optional(),
    notes: z.string().optional(),
  }).parse({
    invoiceId: String(fd.get("invoiceId") ?? ""),
    amount: fd.get("amount"),
    method: String(fd.get("method") ?? "PIX"),
    externalReference: String(fd.get("externalReference") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const settings = await db.financialSettings.findUnique({
    where: { organizationId: org.id },
  });

  const prefix = settings?.receiptPrefix ?? "REC";

  const result = await retrySerializable(() => db.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Invoice"
        WHERE "id" = ${p.invoiceId}
          AND "organizationId" = ${org.id}
        FOR UPDATE
      `;

      if (p.externalReference) {
        const existingPayment = await tx.payment.findFirst({
          where: {
            organizationId: org.id,
            invoiceId: p.invoiceId,
            externalReference: p.externalReference,
          },
        });

        if (existingPayment) {
          if (
            Number(existingPayment.amount) !== p.amount ||
            existingPayment.method !== p.method
          ) {
            throw new Error("Referência externa já utilizada com dados diferentes.");
          }

          return { invoiceId: existingPayment.invoiceId };
        }
      }

      const invoice = await tx.invoice.findFirst({
        where: {
          id: p.invoiceId,
          organizationId: org.id,
          status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
        },
        include: { payments: true },
      });

      if (!invoice) throw new Error("Cobrança inválida ou já quitada.");

      const currentPaid = invoice.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );

      const targetAmount =
        Number(invoice.amount) -
        Number(invoice.discountAmount) +
        Number(invoice.fineAmount) +
        Number(invoice.interestAmount);

      if (currentPaid + p.amount > targetAmount + 0.01) {
        throw new Error("Pagamento excede o saldo da cobrança.");
      }

      const payment = await tx.payment.create({
        data: {
          organizationId: org.id,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          amount: p.amount,
          method: p.method,
          externalReference: p.externalReference || null,
          notes: p.notes || null,
        },
      });

      const newPaid = currentPaid + p.amount;
      const settled = newPaid >= targetAmount - 0.01;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: settled
          ? { status: "PAID", paidAt: new Date() }
          : { status: "PARTIAL", paidAt: null },
      });

      const receiptNumber =
        `${prefix}-${Date.now()}-${payment.id.slice(-6).toUpperCase()}`;

      const receipt = await tx.receipt.create({
        data: {
          organizationId: org.id,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          number: receiptNumber,
          amount: p.amount,
          description: `Pagamento de ${invoice.description}`,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          action: "PAY",
          entity: "Invoice",
          entityId: invoice.id,
          metadata: {
            paymentId: payment.id,
            receiptId: receipt.id,
            amount: p.amount,
            method: p.method,
          },
        },
      });

      return { invoiceId: invoice.id };
    },
    { isolationLevel: "ReadCommitted" },
  ));

  revalidatePath("/dashboard/financeiro/cobrancas");
  revalidatePath("/dashboard/financeiro");
  revalidatePath(`/api/recibos/${result.invoiceId}`);
}

export async function applyOverdueChargesAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireModulePermission("finance", "update");

  const id = z.string().min(1).parse(String(fd.get("invoiceId") ?? ""));

  const [invoice, settings] = await Promise.all([
    db.invoice.findFirst({
      where: {
        id,
        organizationId: org.id,
        status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
      },
    }),
    db.financialSettings.findUnique({
      where: { organizationId: org.id },
    }),
  ]);

  if (!invoice) throw new Error("Cobrança inválida.");
  if (invoice.dueAt >= new Date()) {
    throw new Error("Cobrança ainda não venceu.");
  }

  const base =
    Number(invoice.amount) - Number(invoice.discountAmount);

  const lateFeePercent = Number(settings?.lateFeePercent ?? 2);
  const monthlyInterestPercent = Number(
    settings?.monthlyInterestPercent ?? 1,
  );

  const daysLate = Math.max(
    1,
    Math.floor(
      (Date.now() - invoice.dueAt.getTime()) / 86_400_000,
    ),
  );

  const fineAmount = (base * lateFeePercent) / 100;
  const interestAmount =
    (base * monthlyInterestPercent * (daysLate / 30)) / 100;

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "OVERDUE",
      fineAmount,
      interestAmount,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "OVERDUE",
      entity: "Invoice",
      entityId: invoice.id,
      metadata: { daysLate, fineAmount, interestAmount },
    },
  });

  revalidatePath("/dashboard/financeiro/cobrancas");
  revalidatePath("/dashboard/financeiro");
}

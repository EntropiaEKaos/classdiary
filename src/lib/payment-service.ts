import { db } from "@/lib/db";
import { retrySerializable } from "@/lib/transaction-retry";

export type RecordPaymentInput = {
  organizationId: string;
  userId: string;
  invoiceId: string;
  amount: number;
  method: "PIX" | "CASH" | "CARD" | "TRANSFER" | "OTHER";
  externalReference?: string | null;
  notes?: string | null;
};

export async function recordPayment(input: RecordPaymentInput) {
  const settings = await db.financialSettings.findUnique({
    where: { organizationId: input.organizationId },
  });
  const prefix = settings?.receiptPrefix ?? "REC";

  return retrySerializable(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Invoice"
        WHERE "id" = ${input.invoiceId}
          AND "organizationId" = ${input.organizationId}
        FOR UPDATE
      `;

      if (input.externalReference) {
        const existingPayment = await tx.payment.findFirst({
          where: {
            organizationId: input.organizationId,
            invoiceId: input.invoiceId,
            externalReference: input.externalReference,
          },
        });

        if (existingPayment) {
          if (
            Number(existingPayment.amount) !== input.amount ||
            existingPayment.method !== input.method
          ) {
            throw new Error("Referência externa já utilizada com dados diferentes.");
          }
          return { invoiceId: existingPayment.invoiceId };
        }
      }

      const invoice = await tx.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organizationId: input.organizationId,
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

      if (currentPaid + input.amount > targetAmount + 0.01) {
        throw new Error("Pagamento excede o saldo da cobrança.");
      }

      const payment = await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          amount: input.amount,
          method: input.method,
          externalReference: input.externalReference || null,
          notes: input.notes || null,
        },
      });

      const settled = currentPaid + input.amount >= targetAmount - 0.01;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: settled
          ? { status: "PAID", paidAt: new Date() }
          : { status: "PARTIAL", paidAt: null },
      });

      const receipt = await tx.receipt.create({
        data: {
          organizationId: input.organizationId,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          number: `${prefix}-${Date.now()}-${payment.id.slice(-6).toUpperCase()}`,
          amount: input.amount,
          description: `Pagamento de ${invoice.description}`,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          action: "PAY",
          entity: "Invoice",
          entityId: invoice.id,
          metadata: {
            paymentId: payment.id,
            receiptId: receipt.id,
            amount: input.amount,
            method: input.method,
          },
        },
      });

      return { invoiceId: invoice.id };
    }, { isolationLevel: "ReadCommitted" }),
  );
}

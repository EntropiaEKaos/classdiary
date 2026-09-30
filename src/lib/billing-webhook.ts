import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "@/lib/db";
import type { BillingWebhookEvent } from "@/lib/billing-provider";

async function createEventIdempotently(
  tx: Prisma.TransactionClient,
  organizationId: string,
  event: BillingWebhookEvent,
) {
  const payload = event.payload ? JSON.stringify(event.payload) : null;
  const eventId = randomUUID();
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "BillingEvent"
      ("id", "organizationId", "provider", "providerEventId", "type",
       "externalReference", "payload", "createdAt")
    VALUES
      (${eventId}, ${organizationId}, ${event.provider},
       ${event.providerEventId}, ${event.type}, ${event.externalReference},
       ${payload}::jsonb, NOW())
    ON CONFLICT ("providerEventId") DO NOTHING
    RETURNING "id"
  `;

  if (inserted[0]) {
    return tx.billingEvent.findUnique({ where: { id: inserted[0].id } });
  }

  return tx.billingEvent.findUnique({
    where: { providerEventId: event.providerEventId },
  });
}

export async function processBillingWebhookEvent(event: BillingWebhookEvent) {
  return db.$transaction(async (tx) => {
    const checkout = await tx.billingCheckout.findUnique({
      where: { externalReference: event.externalReference },
    });
    if (!checkout) throw new Error("Checkout SaaS não encontrado para o evento.");

    const existingEvent = await tx.billingEvent.findUnique({
      where: { providerEventId: event.providerEventId },
    });
    if (existingEvent?.processedAt) {
      return { duplicated: true, eventId: existingEvent.id };
    }

    const persisted = existingEvent ?? await createEventIdempotently(
      tx,
      checkout.organizationId,
      event,
    );
    if (!persisted) throw new Error("Não foi possível persistir o evento de billing.");

    if (persisted.processedAt) {
      return { duplicated: true, eventId: persisted.id };
    }

    const claim = await tx.billingEvent.updateMany({
      where: { id: persisted.id, processedAt: null },
      data: { processedAt: new Date() },
    });

    if (claim.count === 0) {
      return { duplicated: true, eventId: persisted.id };
    }

    if (event.type === "CHECKOUT_APPROVED") {
      const periodEnd = new Date();
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

      await tx.subscription.update({
        where: { organizationId: checkout.organizationId },
        data: {
          plan: checkout.plan,
          seats: checkout.seats,
          status: "ACTIVE",
          trialEndsAt: null,
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.billingCheckout.update({
        where: { id: checkout.id },
        data: { status: "PAID", provider: event.provider },
      });
    } else if (event.type === "PAYMENT_FAILED") {
      await tx.subscription.update({
        where: { organizationId: checkout.organizationId },
        data: { status: "PAST_DUE" },
      });
    } else if (event.type === "SUBSCRIPTION_CANCELED") {
      await tx.subscription.update({
        where: { organizationId: checkout.organizationId },
        data: { status: "CANCELED" },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: checkout.requestedByUserId,
        organizationId: checkout.organizationId,
        action: "PROCESS",
        entity: "BillingEvent",
        entityId: persisted.id,
        metadata: {
          provider: event.provider,
          providerEventId: event.providerEventId,
          type: event.type,
          externalReference: event.externalReference,
        },
      },
    });

    return { duplicated: false, eventId: persisted.id };
  });
}

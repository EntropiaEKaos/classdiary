import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  getBillingProvider,
  type BillingProvider,
} from "@/lib/billing-provider";
import { PLAN_CATALOG, type PlanCode } from "@/lib/plans";

export type CreateSaasCheckoutInput = {
  organizationId: string;
  requestedByUserId: string;
  plan: PlanCode;
  seats: number;
  customerEmail?: string | null;
  returnUrl: string;
  provider?: BillingProvider;
};

export async function createSaasCheckout(input: CreateSaasCheckoutInput) {
  const limits = PLAN_CATALOG[input.plan];
  if (input.seats < 1) throw new Error("Quantidade de usuários inválida.");
  if (limits.maxSeats !== null && input.seats > limits.maxSeats) {
    throw new Error(
      `O plano ${limits.label} permite no máximo ${limits.maxSeats} usuários.`,
    );
  }

  const externalReference = `SAAS-${randomUUID()}`;
  const checkout = await db.billingCheckout.create({
    data: {
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      plan: input.plan,
      seats: input.seats,
      status: "PENDING",
      externalReference,
    },
  });

  const provider = input.provider ?? getBillingProvider();

  try {
    const session = await provider.createCheckout({
      organizationId: input.organizationId,
      plan: input.plan,
      seats: input.seats,
      customerEmail: input.customerEmail,
      returnUrl: input.returnUrl,
    });

    const ready = await db.billingCheckout.update({
      where: { id: checkout.id },
      data: {
        status: "READY",
        provider: session.provider,
        checkoutUrl: session.checkoutUrl,
      },
    });

    await db.auditLog.create({
      data: {
        userId: input.requestedByUserId,
        organizationId: input.organizationId,
        action: "CREATE",
        entity: "BillingCheckout",
        entityId: ready.id,
        metadata: {
          plan: input.plan,
          seats: input.seats,
          provider: session.provider,
          externalReference,
        },
      },
    });

    return ready;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no gateway.";

    await db.billingCheckout.update({
      where: { id: checkout.id },
      data: {
        status: "FAILED",
        failureReason: message.slice(0, 500),
      },
    });

    throw error;
  }
}

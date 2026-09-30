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
  idempotencyKey: string;
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

  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error("Chave de idempotência de checkout inválida.");
  }

  const externalReference = `SAAS-${randomUUID()}`;
  let checkout;
  try {
    checkout = await db.billingCheckout.create({
      data: {
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
        plan: input.plan,
        seats: input.seats,
        status: "PENDING",
        externalReference,
        idempotencyKey,
      },
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";

    if (code !== "P2002") throw error;

    checkout = await db.billingCheckout.findUnique({
      where: { idempotencyKey },
    });
    if (!checkout) throw error;
  }

  if (
    checkout.organizationId !== input.organizationId ||
    checkout.plan !== input.plan ||
    checkout.seats !== input.seats
  ) {
    throw new Error("Chave de idempotência já utilizada com outro checkout.");
  }

  if (checkout.status === "READY") return checkout;
  if (checkout.status === "FAILED") {
    throw new Error(checkout.failureReason ?? "Checkout anterior falhou.");
  }

  const claim = await db.billingCheckout.updateMany({
    where: { id: checkout.id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });

  if (claim.count === 0) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const current = await db.billingCheckout.findUnique({
        where: { id: checkout.id },
      });
      if (!current) throw new Error("Checkout não encontrado.");
      if (current.status === "READY") return current;
      if (current.status === "FAILED") {
        throw new Error(current.failureReason ?? "Checkout anterior falhou.");
      }
    }
    throw new Error("Checkout já está sendo processado.");
  }

  const provider = input.provider ?? getBillingProvider();

  try {
    const session = await provider.createCheckout({
      organizationId: input.organizationId,
      externalReference: checkout.externalReference,
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
          externalReference: ready.externalReference,
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

import {
  getBillingProvider,
  type BillingProvider,
} from "@/lib/billing-provider";
import { db } from "@/lib/db";
import { processBillingWebhookEvent } from "@/lib/billing-webhook";

export async function reconcileBillingSubscription(
  organizationId: string,
  providerOverride?: BillingProvider,
) {
  const checkout = await db.billingCheckout.findFirst({
    where: {
      organizationId,
      status: { in: ["READY", "PAID"] },
      provider: { not: null },
      providerSubscriptionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!checkout?.providerSubscriptionId) {
    throw new Error("Assinatura externa ainda não está vinculada a esta escola.");
  }

  const provider = providerOverride ?? getBillingProvider();
  if (!provider.reconcileSubscription) {
    throw new Error("Provider de cobrança não suporta reconciliação.");
  }

  const event = await provider.reconcileSubscription({
    providerSubscriptionId: checkout.providerSubscriptionId,
    externalReference: checkout.externalReference,
  });

  if (
    event.externalReference !== checkout.externalReference ||
    event.providerSubscriptionId !== checkout.providerSubscriptionId
  ) {
    throw new Error("Reconciliação retornou uma assinatura divergente.");
  }

  return processBillingWebhookEvent(event);
}

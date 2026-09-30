import { expect, test } from "@playwright/test";
import { db } from "../src/lib/db";
import { createSaasCheckout } from "../src/lib/saas-checkout";
import { processBillingWebhookEvent } from "../src/lib/billing-webhook";

test("approved billing webhook activates subscription exactly once", async () => {
  const org = await db.organization.findUnique({
    where: { slug: "escola-demo" },
    include: { subscription: true, memberships: { take: 1 } },
  });

  expect(org).not.toBeNull();
  expect(org!.subscription).not.toBeNull();
  expect(org!.memberships.length).toBeGreaterThan(0);

  const original = org!.subscription!;
  const key = "billing-activation-" + Date.now();
  const provider = {
    async createCheckout() {
      return {
        provider: "E2E_FAKE",
        externalReference: "provider-" + key,
        checkoutUrl: "https://example.test/checkout",
      };
    },
  };

  const checkout = await createSaasCheckout({
    organizationId: org!.id,
    requestedByUserId: org!.memberships[0].userId,
    plan: "PRO",
    seats: 80,
    customerEmail: "billing-e2e@example.local",
    returnUrl: "http://127.0.0.1:3000/dashboard/plano",
    idempotencyKey: key,
    provider,
  });

  const event = {
    provider: "E2E_FAKE",
    providerEventId: "evt-" + key,
    type: "CHECKOUT_APPROVED" as const,
    externalReference: checkout.externalReference,
    payload: { source: "e2e" },
  };

  try {
    const [first, second] = await Promise.all([
      processBillingWebhookEvent(event),
      processBillingWebhookEvent(event),
    ]);

    expect([first.duplicated, second.duplicated].filter(Boolean)).toHaveLength(1);

    const [subscription, updatedCheckout, events, audits] = await Promise.all([
      db.subscription.findUnique({ where: { organizationId: org!.id } }),
      db.billingCheckout.findUnique({ where: { id: checkout.id } }),
      db.billingEvent.findMany({
        where: { providerEventId: event.providerEventId },
      }),
      db.auditLog.findMany({
        where: {
          organizationId: org!.id,
          entity: "BillingEvent",
          entityId: first.eventId,
          action: "PROCESS",
        },
      }),
    ]);

    expect(subscription?.status).toBe("ACTIVE");
    expect(subscription?.plan).toBe("PRO");
    expect(subscription?.seats).toBe(80);
    expect(subscription?.trialEndsAt).toBeNull();
    expect(subscription?.currentPeriodEnd).not.toBeNull();
    expect(updatedCheckout?.status).toBe("PAID");
    expect(events).toHaveLength(1);
    expect(events[0].processedAt).not.toBeNull();
    expect(audits).toHaveLength(1);
  } finally {
    await db.auditLog.deleteMany({
      where: { organizationId: org!.id, entityId: { in: [checkout.id] } },
    });
    await db.billingEvent.deleteMany({
      where: { providerEventId: event.providerEventId },
    });
    await db.billingCheckout.deleteMany({ where: { id: checkout.id } });
    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        plan: original.plan,
        status: original.status,
        seats: original.seats,
        trialEndsAt: original.trialEndsAt,
        currentPeriodEnd: original.currentPeriodEnd,
      },
    });
  }
});

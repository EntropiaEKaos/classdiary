import { expect, test } from "@playwright/test";
import { db } from "../src/lib/db";
import { updateSubscriptionPlan } from "../src/lib/subscription-admin";
import { withPlanCapacity } from "../src/lib/plans";

test("plan downgrade racing class creation never leaves tenant over Starter limit", async () => {
  const org = await db.organization.findUnique({
    where: { slug: "escola-demo" },
    include: { subscription: true },
  });
  const actor = await db.user.findUnique({
    where: {
      email: process.env.SEED_OWNER_EMAIL ?? "admin@classdiary.local",
    },
  });
  const year = await db.schoolYear.findFirst({
    where: { organizationId: org?.id, active: true },
  });

  expect(org).not.toBeNull();
  expect(org!.subscription).not.toBeNull();
  expect(actor).not.toBeNull();
  expect(year).not.toBeNull();

  const original = org!.subscription!;
  const existingClasses = await db.classGroup.count({
    where: { organizationId: org!.id },
  });
  const fillerCount = Math.max(0, 12 - existingClasses);
  const prefix = "E2E-LIMIT-" + Date.now();

  try {
    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        plan: "PRO",
        status: "ACTIVE",
        seats: Math.max(original.seats, 30),
      },
    });

    for (let index = 0; index < fillerCount; index += 1) {
      await db.classGroup.create({
        data: {
          organizationId: org!.id,
          schoolYearId: year!.id,
          name: prefix + "-FILL-" + index,
        },
      });
    }

    const beforeRace = await db.classGroup.count({
      where: { organizationId: org!.id },
    });
    expect(beforeRace).toBe(12);

    const results = await Promise.allSettled([
      updateSubscriptionPlan({
        actorUserId: actor!.id,
        organizationId: org!.id,
        plan: "STARTER",
        status: "ACTIVE",
        seats: Math.min(Math.max(original.seats, 1), 30),
      }),
      withPlanCapacity(
        org!.id,
        "classes",
        async (tx) =>
          tx.classGroup.create({
            data: {
              organizationId: org!.id,
              schoolYearId: year!.id,
              name: prefix + "-RACE",
            },
          }),
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled").length).toBe(1);

    const [finalSubscription, finalClasses] = await Promise.all([
      db.subscription.findUnique({
        where: { organizationId: org!.id },
      }),
      db.classGroup.count({
        where: { organizationId: org!.id },
      }),
    ]);

    expect(
      finalSubscription?.plan === "STARTER" && finalClasses > 12,
    ).toBe(false);
  } finally {
    await db.classGroup.deleteMany({
      where: {
        organizationId: org!.id,
        name: { startsWith: prefix },
      },
    });

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

    await db.auditLog.deleteMany({
      where: {
        organizationId: org!.id,
        entity: "Subscription",
        userId: actor!.id,
        metadata: {
          path: ["plan"],
          equals: "STARTER",
        },
      },
    }).catch(() => undefined);
  }
});

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
      email: process.env.SEED_OWNER_EMAIL ?? "admin@edusync.local",
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


test("concurrent last-seat admissions consume exactly one seat", async () => {
  const org = await db.organization.findUnique({
    where: { slug: "escola-demo" },
    include: { subscription: true },
  });
  expect(org).not.toBeNull();
  expect(org!.subscription).not.toBeNull();

  const original = org!.subscription!;
  const memberships = await db.membership.findMany({
    where: { organizationId: org!.id, user: { active: true } },
    distinct: ["userId"],
    select: { userId: true },
  });

  const suffix = Date.now();
  const users = await Promise.all([
    db.user.create({
      data: {
        name: "Seat Race A",
        email: `seat-race-a-${suffix}@example.local`,
        active: true,
      },
    }),
    db.user.create({
      data: {
        name: "Seat Race B",
        email: `seat-race-b-${suffix}@example.local`,
        active: true,
      },
    }),
  ]);

  try {
    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        plan: "STARTER",
        status: "ACTIVE",
        seats: memberships.length + 1,
      },
    });

    const admit = (userId: string) =>
      withPlanCapacity(
        org!.id,
        "seats",
        async (tx) =>
          tx.membership.create({
            data: {
              organizationId: org!.id,
              userId,
              role: "TEACHER",
            },
          }),
        async (tx) => {
          const existing = await tx.membership.findFirst({
            where: { organizationId: org!.id, userId },
            select: { id: true },
          });
          return existing ? 0 : 1;
        },
      );

    const results = await Promise.allSettled([
      admit(users[0].id),
      admit(users[1].id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled").length).toBe(1);

    const createdMemberships = await db.membership.count({
      where: {
        organizationId: org!.id,
        userId: { in: users.map((user) => user.id) },
      },
    });
    expect(createdMemberships).toBe(1);

    const finalUsage = await db.membership.findMany({
      where: { organizationId: org!.id, user: { active: true } },
      distinct: ["userId"],
      select: { userId: true },
    });
    expect(finalUsage).toHaveLength(memberships.length + 1);
  } finally {
    await db.membership.deleteMany({
      where: {
        organizationId: org!.id,
        userId: { in: users.map((user) => user.id) },
      },
    });
    await db.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
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
  }
});

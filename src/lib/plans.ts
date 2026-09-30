import type { Prisma } from "../../generated/prisma/client";
import { db } from "@/lib/db";
import { retrySerializable } from "@/lib/transaction-retry";
import { subscriptionAccessState } from "@/lib/subscription-lifecycle";

export type PlanCode = "STARTER" | "PRO" | "ENTERPRISE";
export type PlanResource = "students" | "classes" | "seats";

type PlanDefinition = {
  label: string;
  maxStudents: number | null;
  maxClasses: number | null;
  maxSeats: number | null;
};

export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  STARTER: { label: "Starter", maxStudents: 150, maxClasses: 12, maxSeats: 30 },
  PRO: { label: "Pro", maxStudents: 800, maxClasses: 60, maxSeats: 150 },
  ENTERPRISE: { label: "Enterprise", maxStudents: null, maxClasses: null, maxSeats: null },
};

export function normalizePlan(value?: string | null): PlanCode {
  if (value === "PRO" || value === "ENTERPRISE") return value;
  return "STARTER";
}

function resourceLimit(
  plan: PlanCode,
  configuredSeats: number,
  resource: PlanResource,
) {
  const limits = PLAN_CATALOG[plan];
  if (resource === "students") return limits.maxStudents;
  if (resource === "classes") return limits.maxClasses;
  return limits.maxSeats === null
    ? configuredSeats
    : Math.min(configuredSeats, limits.maxSeats);
}

async function currentUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  resource: PlanResource,
) {
  if (resource === "students") {
    return tx.student.count({ where: { organizationId, active: true } });
  }
  if (resource === "classes") {
    return tx.classGroup.count({ where: { organizationId } });
  }
  const memberships = await tx.membership.findMany({
    where: { organizationId, user: { active: true } },
    distinct: ["userId"],
    select: { userId: true },
  });
  return memberships.length;
}

function assertWritableSubscription(subscription: {
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}) {
  const state = subscriptionAccessState(subscription);
  if (state === "BLOCKED") {
    throw new Error(
      "Assinatura fora do período permitido para alterações. Regularize o plano para continuar.",
    );
  }
}

export async function getOrganizationPlanUsage(organizationId: string) {
  const [subscription, students, classes, memberships] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.student.count({ where: { organizationId, active: true } }),
    db.classGroup.count({ where: { organizationId } }),
    db.membership.findMany({
      where: { organizationId, user: { active: true } },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const plan = normalizePlan(subscription?.plan);
  return {
    subscription,
    plan,
    limits: PLAN_CATALOG[plan],
    usage: { students, classes, seats: memberships.length },
  };
}

export async function withPlanCapacity<T>(
  organizationId: string,
  resource: PlanResource,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  requested:
    | number
    | ((tx: Prisma.TransactionClient) => Promise<number>) = 1,
) {
  if (typeof requested === "number" && requested < 0) {
    throw new Error("Quantidade de capacidade inválida.");
  }

  return retrySerializable(() => db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        plan: string;
        status: string;
        seats: number;
        trialEndsAt: Date | null;
        currentPeriodEnd: Date | null;
      }>
    >`
      SELECT "id", "plan", "status", "seats", "trialEndsAt", "currentPeriodEnd"
      FROM "Subscription"
      WHERE "organizationId" = ${organizationId}
      FOR UPDATE
    `;

    const subscription = locked[0];
    if (!subscription) throw new Error("Assinatura da escola não encontrada.");

    assertWritableSubscription(subscription);

    const requestedCount =
      typeof requested === "function" ? await requested(tx) : requested;
    if (requestedCount < 0) {
      throw new Error("Quantidade de capacidade inválida.");
    }

    const plan = normalizePlan(subscription.plan);
    const current = await currentUsage(tx, organizationId, resource);
    const limit = resourceLimit(plan, subscription.seats, resource);

    if (requestedCount > 0 && limit !== null && current + requestedCount > limit) {
      const labels: Record<PlanResource, string> = {
        students: "alunos ativos",
        classes: "turmas",
        seats: "usuários",
      };
      throw new Error(
        `Limite do plano ${PLAN_CATALOG[plan].label} excedido para ${labels[resource]} (${current} atuais + ${requestedCount} solicitados / ${limit}).`,
      );
    }

    return operation(tx);
  }, { isolationLevel: "Serializable" }));
}

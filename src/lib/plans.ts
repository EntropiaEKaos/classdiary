"use server";

import { db } from "@/lib/db";

export type PlanCode = "STARTER" | "PRO" | "ENTERPRISE";
export type PlanResource = "students" | "classes" | "seats";

type PlanDefinition = {
  label: string;
  maxStudents: number | null;
  maxClasses: number | null;
  maxSeats: number | null;
};

export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  STARTER: {
    label: "Starter",
    maxStudents: 150,
    maxClasses: 12,
    maxSeats: 30,
  },
  PRO: {
    label: "Pro",
    maxStudents: 800,
    maxClasses: 60,
    maxSeats: 150,
  },
  ENTERPRISE: {
    label: "Enterprise",
    maxStudents: null,
    maxClasses: null,
    maxSeats: null,
  },
};

export function normalizePlan(value?: string | null): PlanCode {
  if (value === "PRO" || value === "ENTERPRISE") return value;
  return "STARTER";
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
  const limits = PLAN_CATALOG[plan];

  return {
    subscription,
    plan,
    limits,
    usage: {
      students,
      classes,
      seats: memberships.length,
    },
  };
}

export async function assertOrganizationWritable(organizationId: string) {
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) {
    throw new Error("Assinatura da escola não encontrada.");
  }

  if (subscription.status === "CANCELED") {
    throw new Error("Assinatura cancelada. Reative o plano para continuar alterando dados.");
  }

  if (
    subscription.status === "TRIAL" &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt.getTime() < Date.now()
  ) {
    throw new Error("Período de teste encerrado. Ative um plano para continuar.");
  }

  return subscription;
}

export async function assertPlanCapacity(
  organizationId: string,
  resource: PlanResource,
) {
  await assertOrganizationWritable(organizationId);
  const snapshot = await getOrganizationPlanUsage(organizationId);

  const limit =
    resource === "students"
      ? snapshot.limits.maxStudents
      : resource === "classes"
        ? snapshot.limits.maxClasses
        : Math.min(
            snapshot.subscription?.seats ?? snapshot.limits.maxSeats ?? 100000,
            snapshot.limits.maxSeats ?? 100000,
          );

  const current = snapshot.usage[resource];

  if (limit !== null && current >= limit) {
    const labels: Record<PlanResource, string> = {
      students: "alunos ativos",
      classes: "turmas",
      seats: "usuários",
    };
    throw new Error(
      `Limite do plano ${snapshot.limits.label} atingido para ${labels[resource]} (${current}/${limit}).`,
    );
  }

  return snapshot;
}

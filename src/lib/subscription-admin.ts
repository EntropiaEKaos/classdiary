import type { SubscriptionStatus } from "../../generated/prisma/client";
import { db } from "@/lib/db";
import { PLAN_CATALOG, type PlanCode } from "@/lib/plans";
import { retrySerializable } from "@/lib/transaction-retry";

export type UpdateSubscriptionPlanInput = {
  actorUserId: string;
  organizationId: string;
  plan: PlanCode;
  status: SubscriptionStatus;
  seats: number;
};

export async function updateSubscriptionPlan(input: UpdateSubscriptionPlanInput) {
  return retrySerializable(() =>
    db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Subscription"
        WHERE "organizationId" = ${input.organizationId}
        FOR UPDATE
      `;

      if (!locked[0]) {
        throw new Error("Assinatura da organização não encontrada.");
      }

      const [activeStudents, classes, memberships] = await Promise.all([
        tx.student.count({
          where: { organizationId: input.organizationId, active: true },
        }),
        tx.classGroup.count({
          where: { organizationId: input.organizationId },
        }),
        tx.membership.findMany({
          where: { organizationId: input.organizationId, user: { active: true } },
          distinct: ["userId"],
          select: { userId: true },
        }),
      ]);

      const target = PLAN_CATALOG[input.plan];

      if (target.maxStudents !== null && activeStudents > target.maxStudents) {
        throw new Error(
          `A escola possui ${activeStudents} alunos ativos e não cabe no plano ${target.label}.`,
        );
      }

      if (target.maxClasses !== null && classes > target.maxClasses) {
        throw new Error(
          `A escola possui ${classes} turmas e não cabe no plano ${target.label}.`,
        );
      }

      if (target.maxSeats !== null && input.seats > target.maxSeats) {
        throw new Error(
          `O plano ${target.label} permite no máximo ${target.maxSeats} usuários.`,
        );
      }

      if (memberships.length > input.seats) {
        throw new Error(
          `Existem ${memberships.length} usuários ativos. O limite contratado não pode ser menor que o uso atual.`,
        );
      }

      const subscription = await tx.subscription.update({
        where: { organizationId: input.organizationId },
        data: {
          plan: input.plan,
          status: input.status,
          seats: input.seats,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.actorUserId,
          organizationId: input.organizationId,
          action: "UPDATE",
          entity: "Subscription",
          entityId: subscription.id,
          metadata: {
            plan: input.plan,
            status: input.status,
            seats: input.seats,
          },
        },
      });

      return subscription;
    }, { isolationLevel: "Serializable" }),
  );
}

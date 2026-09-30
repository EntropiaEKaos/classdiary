import type { Subscription } from "../../generated/prisma/client";

export const TRIAL_GRACE_DAYS = 3;
export const PAST_DUE_GRACE_DAYS = 5;

export type SubscriptionAccessState =
  | "TRIAL_ACTIVE"
  | "TRIAL_GRACE"
  | "ACTIVE"
  | "PAST_DUE_GRACE"
  | "BLOCKED";

export function subscriptionAccessState(
  subscription: Pick<
    Subscription,
    "status" | "trialEndsAt" | "currentPeriodEnd"
  >,
  now = new Date(),
): SubscriptionAccessState {
  if (subscription.status === "CANCELED") return "BLOCKED";

  if (subscription.status === "TRIAL") {
    if (!subscription.trialEndsAt || subscription.trialEndsAt > now) {
      return "TRIAL_ACTIVE";
    }

    const graceEnd = new Date(
      subscription.trialEndsAt.getTime() + TRIAL_GRACE_DAYS * 86_400_000,
    );
    return graceEnd > now ? "TRIAL_GRACE" : "BLOCKED";
  }

  if (subscription.status === "ACTIVE") return "ACTIVE";

  if (subscription.status === "PAST_DUE") {
    if (!subscription.currentPeriodEnd) return "BLOCKED";
    const graceEnd = new Date(
      subscription.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000,
    );
    return graceEnd > now ? "PAST_DUE_GRACE" : "BLOCKED";
  }

  return "BLOCKED";
}

export function subscriptionAccessMessage(state: SubscriptionAccessState) {
  switch (state) {
    case "TRIAL_ACTIVE":
      return "Período de teste ativo.";
    case "TRIAL_GRACE":
      return "Trial encerrado: período de tolerância ativo.";
    case "ACTIVE":
      return "Assinatura ativa.";
    case "PAST_DUE_GRACE":
      return "Pagamento em atraso: período de tolerância ativo.";
    default:
      return "Assinatura sem acesso para novas alterações.";
  }
}

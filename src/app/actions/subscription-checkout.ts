"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { createSaasCheckout } from "@/lib/saas-checkout";
import { reconcileBillingSubscription } from "@/lib/billing-reconciliation";

export async function startSaasCheckoutAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);
  const input = z.object({
    plan: z.enum(["STARTER", "PRO", "ENTERPRISE"]),
    seats: z.coerce.number().int().min(1).max(100000),
    checkoutToken: z.string().min(12).max(200),
  }).parse({
    plan: String(fd.get("plan") ?? "STARTER"),
    seats: fd.get("seats") ?? 1,
    checkoutToken: String(fd.get("checkoutToken") ?? ""),
  });

  const configuredBase =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
  if (process.env.NODE_ENV === "production" && !configuredBase) {
    throw new Error("APP_URL não configurada para checkout.");
  }
  const returnUrl = new URL(
    "/dashboard/plano",
    configuredBase ?? "http://127.0.0.1:3000",
  ).toString();
  const checkout = await createSaasCheckout({
    organizationId: org.id,
    requestedByUserId: user.id,
    plan: input.plan,
    seats: input.seats,
    customerEmail: org.email ?? user.email,
    returnUrl,
    idempotencyKey: input.checkoutToken,
  });

  if (!checkout.checkoutUrl) {
    throw new Error("Gateway não retornou URL de checkout.");
  }

  redirect(checkout.checkoutUrl);
}


export async function reconcileSaasBillingAction() {
  await assertTrustedMutationOrigin();
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN"]);
  await reconcileBillingSubscription(org.id);
  revalidatePath("/dashboard/plano");
}

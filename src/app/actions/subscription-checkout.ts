"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSchoolRole } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { createSaasCheckout } from "@/lib/saas-checkout";

export async function startSaasCheckoutAction(fd: FormData) {
  await assertTrustedMutationOrigin();

  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);
  const input = z.object({
    plan: z.enum(["STARTER", "PRO", "ENTERPRISE"]),
    seats: z.coerce.number().int().min(1).max(100000),
  }).parse({
    plan: String(fd.get("plan") ?? "STARTER"),
    seats: fd.get("seats") ?? 1,
  });

  const host = (await headers()).get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const checkout = await createSaasCheckout({
    organizationId: org.id,
    requestedByUserId: user.id,
    plan: input.plan,
    seats: input.seats,
    customerEmail: org.email ?? user.email,
    returnUrl: `${protocol}://${host}/dashboard/plano`,
  });

  if (!checkout.checkoutUrl) {
    throw new Error("Gateway não retornou URL de checkout.");
  }

  redirect(checkout.checkoutUrl);
}

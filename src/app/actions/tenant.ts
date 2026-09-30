"use server";

import { revalidatePath } from "next/cache";
import { setActiveOrganization } from "@/lib/auth";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function switchOrganizationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const organizationId = String(fd.get("organizationId") ?? "");
  if (!organizationId) return;

  await setActiveOrganization(organizationId);
  revalidatePath("/dashboard", "layout");
}

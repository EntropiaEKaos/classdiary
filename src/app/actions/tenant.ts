"use server";

import { revalidatePath } from "next/cache";
import { setActiveOrganization } from "@/lib/auth";

export async function switchOrganizationAction(fd: FormData) {
  const organizationId = String(fd.get("organizationId") ?? "");
  if (!organizationId) return;

  await setActiveOrganization(organizationId);
  revalidatePath("/dashboard", "layout");
}

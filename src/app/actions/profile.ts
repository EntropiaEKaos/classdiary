"use server";

import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function updateProfileAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const parsed = z.object({
    name: z.string().min(2).max(120),
    avatarUrl: z.string().url().optional().or(z.literal("")),
  }).parse({
    name: String(fd.get("name") ?? "").trim(),
    avatarUrl: String(fd.get("avatarUrl") ?? "").trim(),
  });

  if (parsed.avatarUrl) {
    const url = new URL(parsed.avatarUrl);
    if (
      url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
    ) {
      throw new Error("A imagem de perfil deve usar HTTPS.");
    }
  }

  const org = await activeOrganization();

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.name, avatarUrl: parsed.avatarUrl || null },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org?.id,
      action: "UPDATE",
      entity: "UserProfile",
      entityId: user.id,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/perfil");
}

export async function updatePreferencesAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();

  await db.userPreference.upsert({
    where: { userId: user.id },
    update: {
      inAppNotifications: fd.get("inAppNotifications") === "on",
      compactMode: fd.get("compactMode") === "on",
    },
    create: {
      userId: user.id,
      inAppNotifications: fd.get("inAppNotifications") === "on",
      compactMode: fd.get("compactMode") === "on",
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/perfil");
}

export async function changePasswordAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requireUser();
  const parsed = z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(10).max(200),
  }).parse({
    currentPassword: String(fd.get("currentPassword") ?? ""),
    newPassword: String(fd.get("newPassword") ?? ""),
  });

  const stored = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!stored?.passwordHash || !(await compare(parsed.currentPassword, stored.passwordHash))) {
    throw new Error("Senha atual inválida.");
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(parsed.newPassword, 12) },
  });

  const org = await activeOrganization();
  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org?.id,
      action: "CHANGE_PASSWORD",
      entity: "User",
      entityId: user.id,
    },
  });

  revalidatePath("/dashboard/perfil");
}

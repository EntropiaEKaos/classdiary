"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformOwner } from "@/lib/auth";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { PLATFORM_SETTINGS_ID } from "@/lib/platform-settings";

const settingsSchema = z.object({
  siteName: z.string().min(2).max(80),
  heroBadge: z.string().min(2).max(120),
  heroTitle: z.string().min(5).max(180),
  heroSubtitle: z.string().min(10).max(500),
  supportEmail: z.string().email().optional().or(z.literal("")),
  supportWhatsapp: z.string().max(40).optional(),
  trialDays: z.coerce.number().int().min(1).max(90),
  publicSignupEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
});

export async function updatePlatformSettingsAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const user = await requirePlatformOwner();

  const parsed = settingsSchema.parse({
    siteName: String(fd.get("siteName") ?? "").trim(),
    heroBadge: String(fd.get("heroBadge") ?? "").trim(),
    heroTitle: String(fd.get("heroTitle") ?? "").trim(),
    heroSubtitle: String(fd.get("heroSubtitle") ?? "").trim(),
    supportEmail: String(fd.get("supportEmail") ?? "").trim().toLowerCase(),
    supportWhatsapp: String(fd.get("supportWhatsapp") ?? "").trim(),
    trialDays: fd.get("trialDays"),
    publicSignupEnabled: fd.get("publicSignupEnabled") === "on",
    maintenanceMode: fd.get("maintenanceMode") === "on",
  });

  await db.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    update: {
      ...parsed,
      supportEmail: parsed.supportEmail || null,
      supportWhatsapp: parsed.supportWhatsapp || null,
      updatedById: user.id,
    },
    create: {
      id: PLATFORM_SETTINGS_ID,
      ...parsed,
      supportEmail: parsed.supportEmail || null,
      supportWhatsapp: parsed.supportWhatsapp || null,
      updatedById: user.id,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entity: "PlatformSettings",
      entityId: PLATFORM_SETTINGS_ID,
      metadata: {
        publicSignupEnabled: parsed.publicSignupEnabled,
        trialDays: parsed.trialDays,
        maintenanceMode: parsed.maintenanceMode,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/cadastro");
  revalidatePath("/onboarding");
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/configuracoes");
}

export async function togglePlatformUserAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const actor = await requirePlatformOwner();
  const userId = z.string().min(1).parse(String(fd.get("userId") ?? ""));

  if (userId === actor.id) {
    throw new Error("O Super Admin não pode bloquear a própria conta.");
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Usuário não encontrado.");

  await db.user.update({
    where: { id: userId },
    data: { active: !target.active },
  });

  if (target.active) {
    await db.session.deleteMany({ where: { userId } });
  }

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: target.active ? "BLOCK" : "UNBLOCK",
      entity: "User",
      entityId: userId,
      metadata: { email: target.email },
    },
  });

  revalidatePath("/super-admin/usuarios");
}


export async function openSupportViewAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const actor = await requirePlatformOwner();
  const organizationId = z.string().min(1).parse(String(fd.get("organizationId") ?? ""));

  const organization = await db.organization.findFirst({
    where: { id: organizationId, slug: { not: "edusync-platform" } },
    select: { id: true, name: true },
  });

  if (!organization) throw new Error("Escola não encontrada.");

  await db.auditLog.create({
    data: {
      userId: actor.id,
      organizationId: organization.id,
      action: "OPEN_SUPPORT_VIEW",
      entity: "Organization",
      entityId: organization.id,
      metadata: { mode: "READ_ONLY", schoolName: organization.name },
    },
  });

  redirect("/super-admin/escolas/" + organization.id + "/suporte");
}

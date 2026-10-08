import { db } from "@/lib/db";

export const PLATFORM_SETTINGS_ID = "platform";

export const DEFAULT_PLATFORM_SETTINGS = {
  id: PLATFORM_SETTINGS_ID,
  siteName: "ClassDiary",
  heroBadge: "Diário de classe 100% online",
  heroTitle: "A escola inteira em um só lugar.",
  heroSubtitle:
    "Presença, notas, aulas, alunos, professores, comunicados e gestão escolar em uma plataforma SaaS moderna, rápida e preparada para crescer com cada instituição.",
  supportEmail: null as string | null,
  supportWhatsapp: null as string | null,
  publicSignupEnabled: true,
  trialDays: 14,
  maintenanceMode: false,
};

export async function getPlatformSettings() {
  const settings = await db.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });

  return settings ?? DEFAULT_PLATFORM_SETTINGS;
}

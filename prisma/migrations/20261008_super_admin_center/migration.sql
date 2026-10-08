CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "siteName" TEXT NOT NULL DEFAULT 'ClassDiary',
    "heroBadge" TEXT NOT NULL DEFAULT 'Diário de classe 100% online',
    "heroTitle" TEXT NOT NULL DEFAULT 'A escola inteira em um só lugar.',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Presença, notas, aulas, alunos, professores, comunicados e gestão escolar em uma plataforma SaaS moderna.',
    "supportEmail" TEXT,
    "supportWhatsapp" TEXT,
    "publicSignupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id","updatedAt")
VALUES ('platform', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

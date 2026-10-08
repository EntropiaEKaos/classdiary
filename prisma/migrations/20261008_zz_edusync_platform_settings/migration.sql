-- Runs after the Super Admin schema migration creates PlatformSettings.
ALTER TABLE "PlatformSettings" ALTER COLUMN "siteName" SET DEFAULT 'EduSync';

UPDATE "PlatformSettings"
SET "siteName" = 'EduSync'
WHERE "siteName" = ('Class' || 'Diary');

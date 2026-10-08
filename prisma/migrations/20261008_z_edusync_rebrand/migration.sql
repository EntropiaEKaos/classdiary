-- Forward-only product rebrand. Historical applied migrations stay immutable.
ALTER TABLE "PlatformSettings" ALTER COLUMN "siteName" SET DEFAULT 'EduSync';

UPDATE "PlatformSettings"
SET "siteName" = 'EduSync'
WHERE "siteName" = ('Class' || 'Diary');

UPDATE "Organization"
SET "slug" = 'edusync-platform'
WHERE "slug" = ('class' || 'diary-platform');

UPDATE "Organization"
SET "name" = 'EduSync Platform'
WHERE "slug" = 'edusync-platform'
  AND "name" = ('Class' || 'Diary Platform');

UPDATE "Organization"
SET "name" = 'Escola Demo EduSync'
WHERE "name" = ('Escola Demo Class' || 'Diary');

UPDATE "User"
SET "name" = 'Administrador EduSync'
WHERE "name" = ('Administrador Class' || 'Diary');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" WHERE "email" = ('admin@class' || 'diary.local')
  ) AND NOT EXISTS (
    SELECT 1 FROM "User" WHERE "email" = 'admin@edusync.local'
  ) THEN
    UPDATE "User"
    SET "email" = 'admin@edusync.local'
    WHERE "email" = ('admin@class' || 'diary.local');
  END IF;
END $$;

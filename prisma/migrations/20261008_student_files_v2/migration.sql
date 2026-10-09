ALTER TABLE "Student"
ADD COLUMN "profilePhotoFileId" TEXT;

ALTER TABLE "StudentDocumentRequirement"
ADD COLUMN "fileAssetId" TEXT;

CREATE INDEX "Student_profilePhotoFileId_idx"
ON "Student"("profilePhotoFileId");

CREATE INDEX "StudentDocumentRequirement_fileAssetId_idx"
ON "StudentDocumentRequirement"("fileAssetId");

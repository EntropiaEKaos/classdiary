import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { assertTrustedMutationOrigin } from "@/lib/security";

const inputSchema = z.object({
  storageKey: z.string().min(1).max(500),
  originalName: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
  category: z.string().min(1).max(60),
  entityType: z.string().max(80).optional().nullable(),
  entityId: z.string().max(160).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    await assertTrustedMutationOrigin();
    const { user, org } = await requireModulePermission("secretary", "create");
    const input = inputSchema.parse(await request.json());

    if (!input.storageKey.startsWith(org.id + "/")) {
      return NextResponse.json({ error: "Chave de storage inválida." }, { status: 403 });
    }

    const existing = await db.fileAsset.findUnique({
      where: { storageKey: input.storageKey },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ id: existing.id, registered: false });
    }

    const file = await db.$transaction(async (tx) => {
      const created = await tx.fileAsset.create({
        data: {
          organizationId: org.id,
          uploadedById: user.id,
          storageKey: input.storageKey,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          category: input.category,
          entityType: input.entityType || null,
          entityId: input.entityId || null,
          publicUrl: null,
        },
      });

      if (
        input.category === "PROFILE_PHOTO" &&
        input.entityType === "Student" &&
        input.entityId
      ) {
        const student = await tx.student.findFirst({
          where: { id: input.entityId, organizationId: org.id },
          select: { id: true, profilePhotoFileId: true },
        });
        if (!student) throw new Error("Aluno inválido.");

        if (student.profilePhotoFileId && student.profilePhotoFileId !== created.id) {
          await tx.fileAsset.updateMany({
            where: {
              id: student.profilePhotoFileId,
              organizationId: org.id,
              category: "PROFILE_PHOTO",
            },
            data: { category: "PROFILE_PHOTO_ARCHIVED" },
          });
        }

        await tx.student.update({
          where: { id: student.id },
          data: { profilePhotoFileId: created.id },
        });
      }

      if (
        input.entityType === "StudentDocumentRequirement" &&
        input.entityId
      ) {
        const requirement = await tx.studentDocumentRequirement.findFirst({
          where: { id: input.entityId, organizationId: org.id },
          select: { id: true },
        });
        if (!requirement) throw new Error("Documento obrigatório inválido.");

        await tx.studentDocumentRequirement.update({
          where: { id: requirement.id },
          data: {
            fileAssetId: created.id,
            fileUrl: null,
            status: "RECEIVED",
            receivedAt: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: "UPLOAD",
          entity: "FileAsset",
          entityId: created.id,
          metadata: {
            storageKey: created.storageKey,
            category: created.category,
            linkedEntityType: created.entityType,
            linkedEntityId: created.entityId,
          },
        },
      });

      return created;
    });

    return NextResponse.json({ id: file.id, registered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao registrar arquivo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

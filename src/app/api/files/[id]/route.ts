import { NextResponse } from "next/server";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { presignDeleteObject, presignGetObject } from "@/lib/s3-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, org } = await requireModulePermission("secretary", "view");
  const { id } = await params;

  const file = await db.fileAsset.findFirst({
    where: { id, organizationId: org.id },
  });

  if (!file) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  await db.auditLog.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      action: "DOWNLOAD",
      entity: "FileAsset",
      entityId: file.id,
      metadata: {
        category: file.category,
        linkedEntityType: file.entityType,
        linkedEntityId: file.entityId,
      },
    },
  });

  return NextResponse.redirect(presignGetObject(file.storageKey));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, org } = await requireModulePermission("secretary", "delete");
    const { id } = await params;

    const file = await db.fileAsset.findFirst({
      where: { id, organizationId: org.id },
    });

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }

    const response = await fetch(presignDeleteObject(file.storageKey), {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      return NextResponse.json(
        { error: "Não foi possível remover o objeto do S3." },
        { status: 502 },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.student.updateMany({
        where: {
          organizationId: org.id,
          profilePhotoFileId: file.id,
        },
        data: { profilePhotoFileId: null },
      });

      await tx.studentDocumentRequirement.updateMany({
        where: {
          organizationId: org.id,
          fileAssetId: file.id,
        },
        data: {
          fileAssetId: null,
          status: "PENDING",
          receivedAt: null,
        },
      });

      await tx.fileAsset.delete({ where: { id: file.id } });

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: "DELETE",
          entity: "FileAsset",
          entityId: file.id,
          metadata: {
            storageKey: file.storageKey,
            category: file.category,
            linkedEntityType: file.entityType,
            linkedEntityId: file.entityId,
          },
        },
      });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao excluir arquivo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

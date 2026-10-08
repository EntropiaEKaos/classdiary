import { NextResponse } from "next/server";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { presignGetObject } from "@/lib/s3-storage";

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

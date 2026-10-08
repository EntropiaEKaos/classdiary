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

    const file = await db.fileAsset.create({
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

    await db.auditLog.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        action: "UPLOAD",
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

    return NextResponse.json({ id: file.id, registered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao registrar arquivo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { buildStorageKey, presignPutObject } from "@/lib/s3-storage";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const inputSchema = z.object({
  originalName: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
  category: z.string().min(1).max(60),
  entityType: z.string().max(80).optional().nullable(),
  entityId: z.string().max(160).optional().nullable(),
});

async function validateEntity(
  organizationId: string,
  entityType?: string | null,
  entityId?: string | null,
) {
  if (!entityType && !entityId) return;
  if (!entityType || !entityId) {
    throw new Error("entityType e entityId devem ser informados juntos.");
  }

  const found =
    entityType === "Student"
      ? await db.student.findFirst({
          where: { id: entityId, organizationId },
          select: { id: true },
        })
      : entityType === "AcademicDocument"
        ? await db.academicDocument.findFirst({
            where: { id: entityId, organizationId },
            select: { id: true },
          })
        : entityType === "Assignment"
          ? await db.assignment.findFirst({
              where: { id: entityId, organizationId },
              select: { id: true },
            })
          : entityType === "Receipt"
            ? await db.receipt.findFirst({
                where: { id: entityId, organizationId },
                select: { id: true },
              })
            : entityType === "StudentContract"
              ? await db.studentContract.findFirst({
                  where: { id: entityId, organizationId },
                  select: { id: true },
                })
              : null;

  if (!found) throw new Error("Entidade inválida para esta escola.");
}

export async function POST(request: Request) {
  try {
    await assertTrustedMutationOrigin();
    const { org } = await requireModulePermission("secretary", "create");
    const input = inputSchema.parse(await request.json());

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não permitido. Use PDF, JPG, PNG ou WEBP." },
        { status: 400 },
      );
    }

    await validateEntity(
      org.id,
      input.entityType || null,
      input.entityId || null,
    );

    const storageKey = buildStorageKey({
      organizationId: org.id,
      category: input.category,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      originalName: input.originalName,
    });

    return NextResponse.json({
      storageKey,
      uploadUrl: presignPutObject(storageKey),
      expiresIn: 900,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao preparar upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(12),
  token: z.string().min(16),
});

function sameSecret(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function trustedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host");

  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const secret = process.env.ADMIN_BOOTSTRAP_TOKEN;

  if (!secret) {
    return NextResponse.json(
      { error: "Bootstrap desabilitado" },
      { status: 503 },
    );
  }

  if (!trustedOrigin(req)) {
    return NextResponse.json(
      { error: "Origem inválida" },
      { status: 403 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));

  if (!parsed.success || !sameSecret(parsed.data.token, secret)) {
    return NextResponse.json(
      { error: "Dados inválidos" },
      { status: 400 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  try {
    const result = await db.$transaction(async (tx) => {
      const existingOwner = await tx.membership.findFirst({
        where: { role: "PLATFORM_OWNER" },
        select: { id: true },
      });

      if (existingOwner) {
        throw new Error("BOOTSTRAP_ALREADY_DONE");
      }

      const existingPlatform = await tx.organization.findUnique({
        where: { slug: "classdiary-platform" },
      });

      const org =
        existingPlatform ??
        (await tx.organization.create({
          data: {
            name: "ClassDiary Platform",
            slug: "classdiary-platform",
            active: true,
            subscription: {
              create: {
                plan: "INTERNAL",
                status: "ACTIVE",
                seats: 1,
              },
            },
          },
        }));

      const email = parsed.data.email.trim().toLowerCase();

      const user = await tx.user.upsert({
        where: { email },
        update: {
          name: parsed.data.name,
          passwordHash,
          active: true,
        },
        create: {
          name: parsed.data.name,
          email,
          passwordHash,
          active: true,
        },
      });

      await tx.membership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "PLATFORM_OWNER",
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          action: "BOOTSTRAP",
          entity: "PlatformOwner",
          entityId: user.id,
        },
      });

      return { userId: user.id };
    });

    return NextResponse.json({ ok: true, ownerId: result.userId });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "BOOTSTRAP_ALREADY_DONE"
    ) {
      return NextResponse.json(
        { error: "Bootstrap já concluído" },
        { status: 409 },
      );
    }

    throw error;
  }
}

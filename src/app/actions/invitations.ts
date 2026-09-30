"use server";

import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";
import type { Prisma } from "../../../generated/prisma/client";
import { assertTrustedMutationOrigin } from "@/lib/security";
import { withPlanCapacity } from "@/lib/plans";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function createInvitationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
  ]);

  const p = z
    .object({
      email: z.string().email(),
      role: z.enum(["TEACHER", "GUARDIAN", "STUDENT"]),
      studentId: z.string().optional(),
    })
    .parse({
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      role: String(fd.get("role") ?? ""),
      studentId: String(fd.get("studentId") ?? "") || undefined,
    });

  if (["GUARDIAN", "STUDENT"].includes(p.role) && !p.studentId) {
    throw new Error("Responsável ou aluno exige vínculo com um aluno.");
  }

  let studentId: string | null = null;

  if (p.studentId) {
    const student = await db.student.findFirst({
      where: {
        id: p.studentId,
        organizationId: org.id,
        active: true,
      },
    });

    if (!student) throw new Error("Aluno inválido para esta escola.");
    studentId = student.id;
  }

  if (p.role === "TEACHER") {
    studentId = null;
  }

  const now = new Date();

  await db.invitation.updateMany({
    where: {
      organizationId: org.id,
      email: p.email,
      role: p.role,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt: now },
  });

  const token = randomBytes(32).toString("hex");

  await db.invitation.create({
    data: {
      organizationId: org.id,
      email: p.email,
      role: p.role,
      studentId,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 48 * 3_600_000),
      sentById: user.id,
    },
  });

  redirect("/dashboard/convites?token=" + token);
}

export async function acceptInvitationAction(fd: FormData) {
  await assertTrustedMutationOrigin();
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");

  if (name.length < 2 || password.length < 10) {
    redirect(
      "/aceitar-convite?token=" +
        encodeURIComponent(token) +
        "&error=invalid",
    );
  }

  const invite = await db.invitation.findUnique({
    where: { tokenHash: digest(token) },
    include: {
      organization: true,
      student: true,
    },
  });

  if (
    !invite ||
    invite.acceptedAt ||
    invite.expiresAt < new Date() ||
    !invite.organization.active
  ) {
    redirect("/aceitar-convite?error=expired");
  }

  if (
    ["GUARDIAN", "STUDENT"].includes(freshInvite.role) &&
    (!invite.student ||
      invite.student.organizationId !== freshInvite.organizationId ||
      !invite.student.active)
  ) {
    redirect("/aceitar-convite?error=invalid");
  }

  const existing = await db.user.findUnique({
    where: { email: invite.email },
  });

  if (existing && !existing.active) {
    redirect("/aceitar-convite?error=disabled");
  }

  const passwordHash = await hash(password, 12);

  const accept = async (tx: Prisma.TransactionClient) => {
    const freshInvite = await tx.invitation.findUnique({
      where: { id: invite.id },
      include: { organization: true, student: true },
    });

    if (
      !freshInvite ||
      freshInvite.acceptedAt ||
      freshInvite.expiresAt < new Date() ||
      !freshInvite.organization.active
    ) {
      return;
    }

    if (
      ["GUARDIAN", "STUDENT"].includes(freshInvite.role) &&
      (!freshInvite.student ||
        freshInvite.student.organizationId !== freshInvite.organizationId ||
        !freshInvite.student.active)
    ) {
      throw new Error("Convite inválido.");
    }

    const current = await tx.user.findUnique({
      where: { email: freshInvite.email },
    });
    if (current && !current.active) {
      throw new Error("Esta conta está desativada.");
    }

    const user = current
      ? await tx.user.update({
          where: { id: current.id },
          data: {
            ...(!current.name ? { name } : {}),
            ...(!current.passwordHash ? { passwordHash } : {}),
          },
        })
      : await tx.user.create({
          data: {
            name,
            email: freshInvite.email,
            passwordHash,
            active: true,
          },
        });

    await tx.membership.upsert({
      where: {
        organizationId_userId_role: {
          organizationId: freshInvite.organizationId,
          userId: user.id,
          role: freshInvite.role,
        },
      },
      update: {},
      create: {
        organizationId: freshInvite.organizationId,
        userId: user.id,
        role: freshInvite.role,
      },
    });

    if (freshInvite.role === "GUARDIAN" && freshInvite.studentId) {
      await tx.studentGuardian.upsert({
        where: {
          studentId_userId: {
            studentId: freshInvite.studentId,
            userId: user.id,
          },
        },
        update: {},
        create: {
          studentId: freshInvite.studentId,
          userId: user.id,
        },
      });
    }

    if (freshInvite.role === "STUDENT" && freshInvite.studentId) {
      await tx.studentUser.upsert({
        where: {
          studentId_userId: {
            studentId: freshInvite.studentId,
            userId: user.id,
          },
        },
        update: {},
        create: {
          studentId: freshInvite.studentId,
          userId: user.id,
        },
      });
    }

    await tx.invitation.update({
      where: { id: freshInvite.id },
      data: { acceptedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        organizationId: freshInvite.organizationId,
        action: "ACCEPT",
        entity: "Invitation",
        entityId: freshInvite.id,
      },
    });
  };

  await withPlanCapacity(
    invite.organizationId,
    "seats",
    accept,
    async (tx) => {
      const currentInvite = await tx.invitation.findUnique({
        where: { id: invite.id },
        select: { acceptedAt: true, expiresAt: true, email: true },
      });
      if (!currentInvite || currentInvite.acceptedAt || currentInvite.expiresAt < new Date()) {
        return 0;
      }

      const current = await tx.user.findUnique({
        where: { email: currentInvite.email },
        select: { id: true, active: true },
      });

      if (current && !current.active) {
        throw new Error("Esta conta está desativada.");
      }

      if (!current) return 1;

      const seat = await tx.membership.findFirst({
        where: {
          organizationId: freshInvite.organizationId,
          userId: current.id,
        },
        select: { id: true },
      });

      return seat ? 0 : 1;
    },
  );

  redirect("/login");
}

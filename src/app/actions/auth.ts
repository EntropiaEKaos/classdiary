"use server";

import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function checkThrottle(key: string) {
  const row = await db.loginThrottle.findUnique({ where: { key } });
  if (!row) return;

  if (row.blockedUntil && row.blockedUntil > new Date()) {
    redirect("/login?error=rate_limited");
  }
}

async function recordFailure(key: string) {
  const now = new Date();

  await db.$transaction(async (tx) => {
    const row = await tx.loginThrottle.findUnique({ where: { key } });

    if (!row) {
      await tx.loginThrottle.create({
        data: {
          key,
          attempts: 1,
          windowStartedAt: now,
          lastAttemptAt: now,
        },
      });
      return;
    }

    const windowExpired =
      now.getTime() - row.windowStartedAt.getTime() > WINDOW_MS;

    const attempts = windowExpired ? 1 : row.attempts + 1;
    const blockedUntil =
      attempts >= MAX_ATTEMPTS
        ? new Date(now.getTime() + BLOCK_MS)
        : null;

    await tx.loginThrottle.update({
      where: { key },
      data: {
        attempts,
        windowStartedAt: windowExpired ? now : row.windowStartedAt,
        blockedUntil,
        lastAttemptAt: now,
      },
    });
  });
}

export async function loginAction(fd: FormData) {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
    })
    .safeParse({
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      password: String(fd.get("password") ?? ""),
    });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";

  const emailKey = "email:" + digest(parsed.data.email);
  const ipKey = "ip:" + digest(ip);

  await checkThrottle(emailKey);
  await checkThrottle(ipKey);

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
  });

  const valid =
    Boolean(user?.passwordHash) &&
    Boolean(user?.active) &&
    (await compare(parsed.data.password, user!.passwordHash!));

  if (!valid) {
    await Promise.all([
      recordFailure(emailKey),
      recordFailure(ipKey),
    ]);

    redirect("/login?error=invalid");
  }

  await db.loginThrottle.deleteMany({
    where: { key: { in: [emailKey, ipKey] } },
  });

  await createSession(user!.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

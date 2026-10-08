import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const COOKIE = "classdiary_session";
const SESSION_MS = 7 * 86_400_000;
const MAX_ACTIVE_SESSIONS = 5;
const PLATFORM_SLUG = "edusync-platform";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function sessionFromCookie() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
          },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date() || !session.user.active) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  return session;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const headerStore = await headers();
  const now = new Date();

  await db.session.deleteMany({
    where: {
      userId,
      expiresAt: { lte: now },
    },
  });

  const activeSessions = await db.session.findMany({
    where: {
      userId,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const stale = activeSessions.slice(MAX_ACTIVE_SESSIONS - 1);

  if (stale.length) {
    await db.session.deleteMany({
      where: { id: { in: stale.map((item) => item.id) } },
    });
  }

  const membership = await db.membership.findFirst({
    where: {
      userId,
      organization: {
        active: true,
        slug: { not: PLATFORM_SLUG },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  await db.session.create({
    data: {
      tokenHash: hash(token),
      userId,
      activeOrganizationId: membership?.organizationId ?? null,
      expiresAt: new Date(Date.now() + SESSION_MS),
      userAgent: headerStore.get("user-agent"),
      ipAddress:
        headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;

  if (token) {
    await db.session.deleteMany({
      where: { tokenHash: hash(token) },
    });
  }

  cookieStore.delete(COOKIE);
}

export async function currentUser() {
  const session = await sessionFromCookie();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function activeOrganization() {
  const session = await sessionFromCookie();
  if (!session) redirect("/login");

  const allowed = session.user.memberships.filter(
    (membership) =>
      membership.organization.active &&
      membership.organization.slug !== PLATFORM_SLUG,
  );

  if (!allowed.length) return null;

  const selected = allowed.find(
    (membership) =>
      membership.organizationId === session.activeOrganizationId,
  );

  return (selected ?? allowed[0]).organization;
}

export async function setActiveOrganization(organizationId: string) {
  const session = await sessionFromCookie();
  if (!session) redirect("/login");

  const allowed = session.user.memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.organization.active &&
      membership.organization.slug !== PLATFORM_SLUG,
  );

  if (!allowed) {
    throw new Error("Organização não disponível para este usuário.");
  }

  await db.session.update({
    where: { id: session.id },
    data: { activeOrganizationId: organizationId },
  });
}

export async function requirePlatformOwner() {
  const user = await requireUser();

  if (
    !user.memberships.some(
      (membership) => membership.role === "PLATFORM_OWNER",
    )
  ) {
    redirect("/dashboard");
  }

  return user;
}

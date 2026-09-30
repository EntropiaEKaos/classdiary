import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;

    const [organizationCount, activeYearCount] = await Promise.all([
      db.organization.count({
        where: {
          active: true,
          slug: { not: "classdiary-platform" },
        },
      }),
      db.schoolYear.count({
        where: {
          active: true,
          organization: {
            active: true,
            slug: { not: "classdiary-platform" },
          },
        },
      }),
    ]);

    return NextResponse.json(
      {
        status: "ready",
        service: "classdiary",
        check: "readiness",
        database: "ok",
        application: "ok",
        organizations: organizationCount,
        activeSchoolYears: activeYearCount,
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("readiness_failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json(
      {
        status: "not_ready",
        service: "classdiary",
        check: "readiness",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

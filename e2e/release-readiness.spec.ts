import { expect, test } from "@playwright/test";
import {
  evaluateReleaseChecks,
  REQUIRED_RETENTION_CATEGORIES,
} from "../src/lib/release-readiness";

test("release gate is ready only when all objective controls pass", async () => {
  const now = new Date("2026-09-30T18:00:00.000Z");
  const checks = evaluateReleaseChecks({
    retentionCategories: [...REQUIRED_RETENTION_CATEGORIES],
    lastBackupStatus: "VERIFIED",
    lastBackupAt: new Date("2026-09-30T12:00:00.000Z"),
    lastRestoreStatus: "SUCCESS",
    lastRestoreAt: new Date("2026-09-15T12:00:00.000Z"),
    lastRestoreDataVerified: true,
    criticalIncidents: 0,
    billingConfigured: true,
    hasProviderSubscription: true,
    now,
  });

  expect(checks.every((check) => check.ok)).toBe(true);
});

test("release gate blocks stale backup and critical incident", async () => {
  const now = new Date("2026-09-30T18:00:00.000Z");
  const checks = evaluateReleaseChecks({
    retentionCategories: [...REQUIRED_RETENTION_CATEGORIES],
    lastBackupStatus: "VERIFIED",
    lastBackupAt: new Date("2026-09-28T12:00:00.000Z"),
    lastRestoreStatus: "SUCCESS",
    lastRestoreAt: new Date("2026-09-15T12:00:00.000Z"),
    lastRestoreDataVerified: true,
    criticalIncidents: 1,
    billingConfigured: true,
    hasProviderSubscription: true,
    now,
  });

  expect(checks.find((check) => check.code === "BACKUP_VERIFIED")?.ok).toBe(false);
  expect(checks.find((check) => check.code === "NO_CRITICAL_INCIDENTS")?.ok).toBe(false);
  expect(checks.every((check) => check.ok)).toBe(false);
});

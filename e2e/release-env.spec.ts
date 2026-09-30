import { expect, test } from "@playwright/test";
import { evaluateProductionEnvironment } from "../src/lib/release-env";

const validEnv = {
  DATABASE_URL: "postgresql://app:strong@db.example.com:5432/classdiary",
  APP_URL: "https://preview.classdiary.example",
  ADMIN_BOOTSTRAP_TOKEN: "0123456789abcdef0123456789abcdef",
  BILLING_PROVIDER: "mercado_pago",
  MERCADO_PAGO_ACCESS_TOKEN: "TEST_ACCESS_TOKEN",
  MERCADO_PAGO_WEBHOOK_SECRET: "TEST_WEBHOOK_SECRET",
  MERCADO_PAGO_PRICE_STARTER_BRL: "49.90",
  MERCADO_PAGO_PRICE_PRO_BRL: "99.90",
  MERCADO_PAGO_PRICE_ENTERPRISE_BRL: "199.90",
};

test("production environment gate accepts a complete non-local configuration", async () => {
  const checks = evaluateProductionEnvironment(validEnv);
  expect(checks.every((check) => check.ok)).toBe(true);
});

test("production environment gate rejects local and default credentials", async () => {
  const checks = evaluateProductionEnvironment({
    ...validEnv,
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/classdiary",
    APP_URL: "http://localhost:3000",
    ADMIN_BOOTSTRAP_TOKEN: "replace-with-a-long-random-token",
    SEED_OWNER_PASSWORD: "ChangeMe123!",
    MERCADO_PAGO_PRICE_PRO_BRL: "0",
  });

  expect(checks.find((check) => check.code === "APP_URL")?.ok).toBe(false);
  expect(checks.find((check) => check.code === "DATABASE_URL")?.ok).toBe(false);
  expect(
    checks.find((check) => check.code === "ADMIN_BOOTSTRAP_TOKEN")?.ok,
  ).toBe(false);
  expect(checks.find((check) => check.code === "BILLING")?.ok).toBe(false);
  expect(
    checks.find((check) => check.code === "SEED_CREDENTIALS")?.ok,
  ).toBe(false);
});

export type ReleaseEnvironmentCheck = {
  code: string;
  ok: boolean;
  detail: string;
};

function positiveMoney(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function evaluateProductionEnvironment(
  env: Record<string, string | undefined>,
): ReleaseEnvironmentCheck[] {
  const appUrl = env.APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || "";
  let appUrlOk = false;
  try {
    const parsed = new URL(appUrl);
    appUrlOk =
      parsed.protocol === "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    appUrlOk = false;
  }

  const bootstrap = env.ADMIN_BOOTSTRAP_TOKEN?.trim() || "";
  const bootstrapOk =
    bootstrap.length >= 32 &&
    !/replace-with|changeme|example|default/i.test(bootstrap);

  const billingProvider = env.BILLING_PROVIDER?.trim().toLowerCase();
  const billingOk =
    billingProvider === "mercado_pago" &&
    Boolean(env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) &&
    Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()) &&
    positiveMoney(env.MERCADO_PAGO_PRICE_STARTER_BRL) &&
    positiveMoney(env.MERCADO_PAGO_PRICE_PRO_BRL) &&
    positiveMoney(env.MERCADO_PAGO_PRICE_ENTERPRISE_BRL);

  const databaseUrl = env.DATABASE_URL?.trim() || "";
  const databaseOk =
    /^postgres(ql)?:\/\//i.test(databaseUrl) &&
    !/localhost|127\.0\.0\.1/i.test(databaseUrl) &&
    !/postgres:postgres@/i.test(databaseUrl);

  const seedPassword = env.SEED_OWNER_PASSWORD?.trim();
  const seedSafe =
    !seedPassword || seedPassword !== "ChangeMe123!";

  return [
    {
      code: "APP_URL",
      ok: appUrlOk,
      detail: appUrlOk
        ? "URL pública HTTPS configurada."
        : "APP_URL/NEXT_PUBLIC_APP_URL deve ser uma URL HTTPS não-local.",
    },
    {
      code: "DATABASE_URL",
      ok: databaseOk,
      detail: databaseOk
        ? "PostgreSQL remoto configurado."
        : "DATABASE_URL deve apontar para PostgreSQL remoto sem credencial padrão.",
    },
    {
      code: "ADMIN_BOOTSTRAP_TOKEN",
      ok: bootstrapOk,
      detail: bootstrapOk
        ? "Token de bootstrap forte configurado."
        : "ADMIN_BOOTSTRAP_TOKEN deve ter pelo menos 32 caracteres e não usar valor padrão.",
    },
    {
      code: "BILLING",
      ok: billingOk,
      detail: billingOk
        ? "Mercado Pago e preços dos planos configurados."
        : "Billing Mercado Pago incompleto ou com preço inválido.",
    },
    {
      code: "SEED_CREDENTIALS",
      ok: seedSafe,
      detail: seedSafe
        ? "Senha padrão de seed não está ativa."
        : "SEED_OWNER_PASSWORD padrão não pode ser usado em release.",
    },
  ];
}

export function assertProductionEnvironment(
  env: Record<string, string | undefined>,
) {
  const checks = evaluateProductionEnvironment(env);
  const failed = checks.filter((check) => !check.ok);
  if (failed.length) {
    throw new Error(
      "Release environment blocked: " +
        failed.map((check) => check.code).join(", "),
    );
  }
  return checks;
}

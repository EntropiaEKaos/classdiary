function required(name: string, value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(`Missing preview configuration: ${name}`);
  }
  return value.trim();
}

function remotePostgres(value: string) {
  return (
    /^postgres(ql)?:\/\//i.test(value) &&
    !/localhost|127\.0\.0\.1|postgres:postgres@/i.test(value)
  );
}

const databaseUrl = required("PREVIEW_DATABASE_URL", process.env.PREVIEW_DATABASE_URL);
required("VERCEL_TOKEN", process.env.VERCEL_TOKEN);
required("VERCEL_ORG_ID", process.env.VERCEL_ORG_ID);
required("VERCEL_PROJECT_ID", process.env.VERCEL_PROJECT_ID);
required("ADMIN_BOOTSTRAP_TOKEN", process.env.ADMIN_BOOTSTRAP_TOKEN);
required("MERCADO_PAGO_ACCESS_TOKEN", process.env.MERCADO_PAGO_ACCESS_TOKEN);
required("MERCADO_PAGO_WEBHOOK_SECRET", process.env.MERCADO_PAGO_WEBHOOK_SECRET);
required("MERCADO_PAGO_PRICE_STARTER_BRL", process.env.MERCADO_PAGO_PRICE_STARTER_BRL);
required("MERCADO_PAGO_PRICE_PRO_BRL", process.env.MERCADO_PAGO_PRICE_PRO_BRL);
required("MERCADO_PAGO_PRICE_ENTERPRISE_BRL", process.env.MERCADO_PAGO_PRICE_ENTERPRISE_BRL);

if (!remotePostgres(databaseUrl)) {
  throw new Error("PREVIEW_DATABASE_URL must be a remote PostgreSQL database with non-default credentials.");
}

if ((process.env.ADMIN_BOOTSTRAP_TOKEN ?? "").trim().length < 32) {
  throw new Error("ADMIN_BOOTSTRAP_TOKEN must have at least 32 characters.");
}

for (const key of [
  "MERCADO_PAGO_PRICE_STARTER_BRL",
  "MERCADO_PAGO_PRICE_PRO_BRL",
  "MERCADO_PAGO_PRICE_ENTERPRISE_BRL",
] as const) {
  const value = Number(process.env[key]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive number.`);
  }
}

console.log("[preview-config] isolated preview configuration accepted");

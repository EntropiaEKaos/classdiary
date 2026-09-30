import { assertProductionEnvironment } from "../src/lib/release-env";

try {
  const checks = assertProductionEnvironment(process.env);
  for (const check of checks) {
    console.log(`[release-env] ${check.code}: OK`);
  }
  console.log("[release-env] environment certified");
} catch (error) {
  console.error(
    "[release-env] blocked:",
    error instanceof Error ? error.message : "unknown_error",
  );
  process.exit(1);
}

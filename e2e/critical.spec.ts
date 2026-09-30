import { expect, test } from "@playwright/test";

test("public health probes and security headers", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect((await live.json()).status).toBe("ok");

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect((await ready.json()).status).toBe("ready");

  const home = await request.get("/");
  expect(home.status()).toBe(200);
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["content-security-policy"]).toContain("default-src 'self'");
});

test("protected dashboard redirects anonymous users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("school admin can login and open critical protected areas", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("E-mail").fill(process.env.SEED_OWNER_EMAIL ?? "admin@classdiary.local");
  await page.getByLabel("Senha").fill(process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Entrar no ClassDiary" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();

  for (const route of [
    "/dashboard/readiness",
    "/dashboard/privacidade",
    "/dashboard/operacao-interna",
    "/dashboard/automacao-institucional",
    "/dashboard/coordenacao",
  ]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main.main").first()).toBeVisible();
  }
});

test("invalid login is rejected without account disclosure", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("naoexiste@classdiary.local");
  await page.getByLabel("Senha").fill("WrongPassword123!");
  await page.getByRole("button", { name: "Entrar no ClassDiary" }).click();

  await expect(page).toHaveURL(/\/login\?error=invalid/);
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
});

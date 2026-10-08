import { expect, Page, test } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(
    process.env.SEED_OWNER_EMAIL ?? "admin@classdiary.local",
  );
  await page.getByLabel("Senha").fill(
    process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!",
  );
  await page.getByRole("button", { name: "Entrar no ClassDiary" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("Experience V4 core routes are reachable", async ({ page }) => {
  await login(page);

  for (const route of [
    "/dashboard/meu-dia",
    "/dashboard/buscar",
    "/dashboard/perfil",
    "/mensagens",
    "/notificacoes",
  ]) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
  }
});

test("global search is available from the school workspace", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard/buscar?q=demo");

  await expect(page.getByRole("heading", { name: "Encontre qualquer coisa" })).toBeVisible();
  await expect(page.locator(".global-search-page")).toBeVisible();
});

test("PWA metadata and service worker are available", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const data = await manifest.json();
  expect(data.name).toBe("ClassDiary");
  expect(data.display).toBe("standalone");

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect(await sw.text()).toContain("classdiary-shell-v1");
});

test("critical mobile routes avoid horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const route of [
    "/dashboard",
    "/dashboard/meu-dia",
    "/dashboard/buscar",
    "/dashboard/perfil",
    "/mensagens",
    "/notificacoes",
    "/agenda",
    "/dashboard/alunos",
    "/dashboard/turmas",
  ]) {
    await page.goto(route);
    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(metrics.body, route).toBeLessThanOrEqual(metrics.viewport + 1);
  }

  await page.goto("/dashboard/meu-dia");
  await expect(page.getByRole("navigation", { name: "Atalhos rápidos" })).toBeVisible();
});

test("platform owner can open audited read-only school support", async ({ page }) => {
  await login(page);
  await page.goto("/super-admin/escolas");

  const support = page.getByRole("button", { name: "Abrir visão de suporte" }).first();
  await expect(support).toBeVisible();
  await support.click();

  await expect(page.getByText("Somente leitura", { exact: false }).first()).toBeVisible();
});

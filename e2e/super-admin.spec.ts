import { expect, Page, test } from "@playwright/test";
import { db } from "../src/lib/db";

async function loginAsPlatformOwner(page: Page) {
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

test("super admin routes require authentication", async ({ page }) => {
  await page.goto("/super-admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("platform owner can open every Admin Center area", async ({ page }) => {
  await loginAsPlatformOwner(page);

  for (const route of [
    "/super-admin",
    "/super-admin/escolas",
    "/super-admin/usuarios",
    "/super-admin/planos",
    "/super-admin/configuracoes",
    "/super-admin/integracoes",
    "/super-admin/seguranca",
    "/super-admin/saude",
  ]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main.admin-page").first()).toBeVisible();
  }
});

test("platform settings persist and control the public site", async ({ page }) => {
  const original = await db.platformSettings.findUnique({
    where: { id: "platform" },
  });
  expect(original).not.toBeNull();

  const title = `ClassDiary Admin Center E2E ${Date.now()}`;

  try {
    await loginAsPlatformOwner(page);
    await page.goto("/super-admin/configuracoes");

    await page.getByLabel("Título da Home").fill(title);
    await page.getByLabel("Duração padrão do trial").fill("21");
    await page.getByRole("button", { name: "Salvar configurações" }).click();

    await page.reload();
    await expect(page.getByLabel("Título da Home")).toHaveValue(title);
    await expect(page.getByLabel("Duração padrão do trial")).toHaveValue("21");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "Começar 21 dias grátis" })).toBeVisible();
  } finally {
    if (original) {
      await db.platformSettings.update({
        where: { id: "platform" },
        data: {
          siteName: original.siteName,
          heroBadge: original.heroBadge,
          heroTitle: original.heroTitle,
          heroSubtitle: original.heroSubtitle,
          supportEmail: original.supportEmail,
          supportWhatsapp: original.supportWhatsapp,
          publicSignupEnabled: original.publicSignupEnabled,
          trialDays: original.trialDays,
          maintenanceMode: original.maintenanceMode,
          updatedById: original.updatedById,
        },
      });
    }
  }
});

test("mobile Admin Center exposes menu, quick navigation and responsive actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsPlatformOwner(page);
  await page.goto("/super-admin/escolas");

  await expect(page.getByLabel("Abrir menu do Admin Center")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Atalhos do Admin Center" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ajustes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar" })).toBeVisible();

  await page.getByLabel("Abrir menu do Admin Center").click();
  const drawer = page.locator(".admin-mobile-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("navigation", { name: "Menu do Admin Center", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Segurança & auditoria", exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Fechar menu do Admin Center", exact: true }).click();
  await expect(drawer).toBeHidden();

  const savePlan = page.getByRole("button", { name: "Salvar plano", exact: true }).first();
  await expect(savePlan).toBeVisible();
  const box = await savePlan.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
});

test("mobile user table becomes readable cards without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsPlatformOwner(page);
  await page.goto("/super-admin/usuarios");

  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
  await expect(page.locator(".admin-responsive-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".admin-responsive-table td[data-label='Usuário']").first()).toBeVisible();
});

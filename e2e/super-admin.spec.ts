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

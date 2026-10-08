import { expect, Page, test } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(
    process.env.SEED_OWNER_EMAIL ?? "admin@edusync.local",
  );
  await page.getByLabel("Senha").fill(
    process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!",
  );
  await page.getByRole("button", { name: "Entrar no EduSync" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("dark mode toggles and persists across navigation and reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Alternar tema claro e escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Alternar tema claro e escuro" })).toBeVisible();
});

test("dashboard mobile navigation remains accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/dashboard");

  const open = page.getByRole("button", { name: "Abrir navegação da escola" });
  await expect(open).toBeVisible();
  await open.click();

  const drawer = page.getByRole("complementary", { name: "Navegação móvel da escola" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("navigation", { name: "Módulos da escola" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Alunos", exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Fechar navegação da escola" }).click();
  await expect(drawer).toBeHidden();

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
});

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

const routes = ["/agenda", "/mensagens", "/notificacoes"];

test("engagement pages expose a clear return to dashboard", async ({ page }) => {
  await login(page);

  for (const route of routes) {
    await page.goto(route);
    const back = page.getByRole("link", { name: "Voltar ao dashboard", exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/dashboard");
  }
});

test("return to dashboard stays usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const route of routes) {
    await page.goto(route);
    const back = page.getByRole("link", { name: "Voltar ao dashboard", exact: true });
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  }
});

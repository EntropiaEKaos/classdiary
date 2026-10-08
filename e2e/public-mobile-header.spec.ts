import { expect, test } from "@playwright/test";

test("mobile public header keeps login visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const login = page.getByRole("link", { name: "Entrar", exact: true });
  await expect(login).toBeVisible();
  await expect(login).toHaveAttribute("href", "/login");

  const box = await login.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
});

test("desktop keeps the dedicated mobile login shortcut hidden", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const shortcuts = page.locator(".public-mobile-login");
  await expect(shortcuts).toHaveCount(1);
  await expect(shortcuts).toBeHidden();

  await expect(page.locator("nav.nav").getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
});

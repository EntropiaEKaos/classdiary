import { expect, Page, test } from "@playwright/test";

const rolePassword = process.env.SEED_ROLE_PASSWORD ?? "RoleDemo123!";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(rolePassword);
  await page.getByRole("button", { name: "Entrar no ClassDiary" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("teacher accesses academic workspaces and is blocked from school finance", async ({ page }) => {
  await login(page, "professor@escolademo.local");

  for (const route of [
    "/dashboard/diarios",
    "/dashboard/frequencia",
    "/dashboard/notas",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/") + "$"));
    await expect(page.locator("main.main").first()).toBeVisible();
  }

  await expect(page.getByRole("link", { name: "Diário de classe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Financeiro" })).toHaveCount(0);

  await page.goto("/dashboard/financeiro");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("secretary accesses student and finance operations but not readiness", async ({ page }) => {
  await login(page, "secretaria@escolademo.local");

  for (const route of [
    "/dashboard/alunos",
    "/dashboard/matriculas",
    "/dashboard/financeiro",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/") + "$"));
    await expect(page.locator("main.main").first()).toBeVisible();
  }

  await expect(page.getByRole("link", { name: "Alunos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Financeiro" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Readiness operacional" })).toHaveCount(0);

  await page.goto("/dashboard/readiness");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("student reaches own portal and cannot enter administrative student registry", async ({ page }) => {
  await login(page, "aluno@escolademo.local");

  await page.goto("/aluno");
  await expect(page).toHaveURL(/\/aluno$/);
  await expect(page.getByText("Portal do Aluno", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aluno Demo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Minha agenda" })).toBeVisible();

  await page.goto("/dashboard/alunos");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("body")).not.toContainText("Novo aluno");
});

test("guardian reaches family portal and cannot enter administrative finance", async ({ page }) => {
  await login(page, "responsavel@escolademo.local");

  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText("Portal da Família", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Responsável Demo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aluno Demo" })).toBeVisible();

  await page.goto("/dashboard/financeiro");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("body")).not.toContainText("Financeiro escolar");
});

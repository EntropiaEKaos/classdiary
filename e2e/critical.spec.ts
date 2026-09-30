import { expect, Page, test } from "@playwright/test";

async function loginAsAdmin(page: Page) {
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
  await loginAsAdmin(page);

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

test("school operations flow: student, enrollment, lesson, attendance and grade", async ({ page }) => {
  const suffix = Date.now().toString();
  const studentName = `Aluno E2E ${suffix}`;
  const registration = `E2E-${suffix}`;
  const periodName = `Período E2E ${suffix}`;
  const lessonTitle = `Aula E2E ${suffix}`;
  const gradeLabel = `Nota E2E ${suffix}`;

  await loginAsAdmin(page);

  await page.goto("/dashboard/configuracoes");
  await page.locator('input[name="name"]').fill(periodName);
  await page.locator('input[name="startsAt"]').fill("2026-01-01");
  await page.locator('input[name="endsAt"]').fill("2026-12-30");
  await page.locator('input[name="order"]').fill("99");
  await page.getByRole("button", { name: "Adicionar período" }).click();
  await expect(page.getByText(periodName)).toBeVisible();

  await page.goto("/dashboard/alunos");
  await page.locator('input[name="name"]').fill(studentName);
  await page.locator('input[name="registration"]').fill(registration);
  await page.locator('input[name="guardianName"]').fill("Responsável E2E");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  await page.goto("/dashboard/matriculas");
  await page.locator('select[name="studentId"]').selectOption({ label: studentName });
  await page.locator('select[name="classGroupId"]').selectOption({ label: "7º Ano A" });
  await page.getByRole("button", { name: "Matricular" }).click();
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  await page.goto("/dashboard/diarios");
  await page.locator('select[name="classGroupId"]').selectOption({ label: "7º Ano A" });
  await page.locator('select[name="subjectId"]').selectOption({ label: "Matemática" });
  await page.locator('select[name="teacherId"]').selectOption({ label: "Professor Demo" });
  await page.locator('input[name="title"]').fill(lessonTitle);
  await page.locator('input[name="content"]').fill("Conteúdo validado por E2E");
  await page.getByRole("button", { name: "Registrar aula" }).click();
  await expect(page.getByText(lessonTitle, { exact: true })).toBeVisible();

  await page.goto("/dashboard/frequencia");
  const lessonCard = page.locator("section.table-card").filter({ hasText: lessonTitle });
  const attendanceRow = lessonCard.locator("form.table-row").filter({ hasText: studentName });
  await attendanceRow.locator('select[name="status"]').selectOption("PRESENT");
  await attendanceRow.getByRole("button", { name: "Salvar" }).click();

  await page.goto("/dashboard/notas");
  await page.locator('select[name="studentId"]').selectOption({ label: studentName });
  await page.locator('select[name="subjectId"]').selectOption({ label: "Matemática" });
  await page.locator('select[name="period"]').selectOption({ label: periodName });
  await page.locator('input[name="label"]').fill(gradeLabel);
  await page.locator('input[name="value"]').fill("8.5");
  await page.getByRole("button", { name: "Lançar nota" }).click();

  const gradeRow = page.locator(".table-row").filter({ hasText: studentName }).filter({ hasText: gradeLabel });
  await expect(gradeRow).toContainText("8.5/10");
});

test("finance and operations flow: contract, invoice, payment and internal task", async ({ page }) => {
  const suffix = Date.now().toString();
  const studentName = `Financeiro E2E ${suffix}`;
  const registration = `FIN-${suffix}`;
  const contractTitle = `Contrato E2E ${suffix}`;
  const taskTitle = `Tarefa E2E ${suffix}`;

  await loginAsAdmin(page);

  await page.goto("/dashboard/alunos");
  await page.locator('input[name="name"]').fill(studentName);
  await page.locator('input[name="registration"]').fill(registration);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  await page.goto("/dashboard/financeiro/contratos");
  await page.locator('select[name="studentId"]').selectOption({ label: studentName + " · " + registration });
  await page.locator('input[name="title"]').fill(contractTitle);
  await page.locator('input[name="startsAt"]').fill("2026-01-01");
  await page.locator('input[name="monthlyAmount"]').fill("321.45");
  await page.getByRole("button", { name: "Criar contrato" }).click();

  const contract = page.locator(".notice").filter({ hasText: contractTitle });
  await expect(contract).toContainText(studentName);
  await contract.locator('input[name="month"]').fill("10");
  await contract.locator('input[name="year"]').fill("2026");
  await contract.getByRole("button", { name: "Gerar mensalidade" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto("/dashboard/financeiro/cobrancas");
  const invoice = page.locator("section.table-card").filter({ hasText: studentName }).filter({ hasText: "Mensalidade 10/2026" });
  await expect(invoice).toBeVisible();
  await invoice.locator('select[name="method"]').selectOption("PIX");
  await invoice.locator('input[name="externalReference"]').fill("E2E-PIX");
  await invoice.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(invoice.getByText("PAID", { exact: true })).toBeVisible();

  await page.goto("/dashboard/operacao-interna");
  await page.locator('input[name="title"]').first().fill(taskTitle);
  await page.locator('select[name="category"]').first().selectOption("ACADEMIC");
  await page.locator('select[name="priority"]').first().selectOption("HIGH");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
});

test("tenant isolation blocks direct access to foreign student", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/dashboard/alunos/e2e-other-student");
  await expect(page.locator("body")).not.toContainText("Aluno Outro Tenant E2E");
  await expect(page.locator("body")).not.toContainText("E2E-FOREIGN-001");
});

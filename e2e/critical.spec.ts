import { expect, Page, test } from "@playwright/test";
import { db } from "../src/lib/db";

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
  const periodName = "Período E2E Base";
  const lessonTitle = `Aula E2E ${suffix}`;
  const gradeLabel = `Nota E2E ${suffix}`;

  await loginAsAdmin(page);

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
  const enrollmentRow = page.locator(".table-row").filter({ hasText: studentName }).filter({ hasText: "7º Ano A" });
  await expect(enrollmentRow).toBeVisible();

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


test("cross-tenant payload tampering cannot mutate foreign student", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/dashboard/alunos/e2e-demo-student");

  const profileForm = page.locator('form').filter({ hasText: "Salvar ficha" });
  const hiddenStudent = profileForm.locator('input[name="studentId"]');
  await expect(hiddenStudent).toHaveValue("e2e-demo-student");
  await hiddenStudent.evaluate((element) => {
    (element as HTMLInputElement).value = "e2e-other-student";
  });

  await page.locator('input[name="guardianName"]').fill("ATAQUE CROSS TENANT");
  await page.getByRole("button", { name: "Salvar ficha" }).click().catch(() => undefined);
  await page.waitForTimeout(300);

  const foreign = await db.student.findUnique({
    where: { id: "e2e-other-student" },
    select: { guardianName: true, registration: true },
  });

  expect(foreign?.registration).toBe("E2E-FOREIGN-001");
  expect(foreign?.guardianName).not.toBe("ATAQUE CROSS TENANT");
});

test("concurrent enrollment keeps one active class per student and school year", async ({ browser }) => {
  const suffix = Date.now().toString();
  const studentName = `Concorrência Matrícula ${suffix}`;
  const registration = `CONC-${suffix}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([loginAsAdmin(pageA), loginAsAdmin(pageB)]);

    await pageA.goto("/dashboard/alunos");
    await pageA.locator('input[name="name"]').fill(studentName);
    await pageA.locator('input[name="registration"]').fill(registration);
    await pageA.getByRole("button", { name: "Cadastrar" }).click();
    await expect(pageA.getByText(studentName, { exact: true })).toBeVisible();

    await Promise.all([
      pageA.goto("/dashboard/matriculas"),
      pageB.goto("/dashboard/matriculas"),
    ]);

    await pageA.locator('select[name="studentId"]').selectOption({ label: studentName });
    await pageA.locator('select[name="classGroupId"]').selectOption({ label: "7º Ano A" });
    await pageB.locator('select[name="studentId"]').selectOption({ label: studentName });
    await pageB.locator('select[name="classGroupId"]').selectOption({ label: "7º Ano B" });

    await Promise.all([
      pageA.getByRole("button", { name: "Matricular" }).click(),
      pageB.getByRole("button", { name: "Matricular" }).click(),
    ]);

    const student = await db.student.findFirst({
      where: { registration },
      select: { id: true },
    });
    expect(student).not.toBeNull();

    const active = await db.enrollment.findMany({
      where: {
        studentId: student!.id,
        active: true,
        classGroup: { schoolYear: { name: "2026" } },
      },
      include: { classGroup: true },
    });

    expect(active).toHaveLength(1);
    expect(["7º Ano A", "7º Ano B"]).toContain(active[0].classGroup.name);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("concurrent duplicate payment is idempotent by external reference", async ({ browser }) => {
  const suffix = Date.now().toString();
  const studentName = `Pagamento Concorrente ${suffix}`;
  const registration = `PAY-${suffix}`;
  const contractTitle = `Contrato Concorrente ${suffix}`;
  const externalReference = `E2E-IDEMP-${suffix}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([loginAsAdmin(pageA), loginAsAdmin(pageB)]);

    await pageA.goto("/dashboard/alunos");
    await pageA.locator('input[name="name"]').fill(studentName);
    await pageA.locator('input[name="registration"]').fill(registration);
    await pageA.getByRole("button", { name: "Cadastrar" }).click();

    await pageA.goto("/dashboard/financeiro/contratos");
    await pageA.locator('select[name="studentId"]').selectOption({
      label: studentName + " · " + registration,
    });
    await pageA.locator('input[name="title"]').fill(contractTitle);
    await pageA.locator('input[name="startsAt"]').fill("2026-01-01");
    await pageA.locator('input[name="monthlyAmount"]').fill("199.90");
    await pageA.getByRole("button", { name: "Criar contrato" }).click();

    const contract = pageA.locator(".notice").filter({ hasText: contractTitle });
    await contract.locator('input[name="month"]').fill("11");
    await contract.locator('input[name="year"]').fill("2026");
    await contract.getByRole("button", { name: "Gerar mensalidade" }).click();
    await pageA.waitForLoadState("networkidle");

    const invoice = await db.invoice.findFirst({
      where: {
        student: { registration },
        reference: { endsWith: "-2026-11" },
      },
      select: { id: true },
    });
    expect(invoice).not.toBeNull();

    await Promise.all([
      pageA.goto("/dashboard/financeiro/cobrancas"),
      pageB.goto("/dashboard/financeiro/cobrancas"),
    ]);

    const invoiceA = pageA.locator("section.table-card").filter({ hasText: studentName }).filter({ hasText: "Mensalidade 11/2026" });
    const invoiceB = pageB.locator("section.table-card").filter({ hasText: studentName }).filter({ hasText: "Mensalidade 11/2026" });

    await invoiceA.locator('input[name="externalReference"]').fill(externalReference);
    await invoiceB.locator('input[name="externalReference"]').fill(externalReference);

    await Promise.all([
      invoiceA.getByRole("button", { name: "Registrar pagamento" }).click(),
      invoiceB.getByRole("button", { name: "Registrar pagamento" }).click(),
    ]);

    const [payments, receipts, finalInvoice] = await Promise.all([
      db.payment.count({ where: { invoiceId: invoice!.id, externalReference } }),
      db.receipt.count({ where: { invoiceId: invoice!.id } }),
      db.invoice.findUnique({ where: { id: invoice!.id }, select: { status: true } }),
    ]);

    expect(payments).toBe(1);
    expect(receipts).toBe(1);
    expect(finalInvoice?.status).toBe("PAID");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("server action rejects a forged cross-origin login mutation", async ({ page }) => {
  let rejectedStatus: number | null = null;

  await page.route("**/login", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const response = await route.fetch({
      headers: {
        ...route.request().headers(),
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
      },
    });
    rejectedStatus = response.status();
    await route.fulfill({ response });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(
    process.env.SEED_OWNER_EMAIL ?? "admin@classdiary.local",
  );
  await page.getByLabel("Senha").fill(
    process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!",
  );
  await page.getByRole("button", { name: "Entrar no ClassDiary" }).click().catch(() => undefined);
  await page.waitForTimeout(300);

  expect(rejectedStatus).not.toBeNull();
  expect(rejectedStatus!).toBeGreaterThanOrEqual(400);
  expect(page.url()).not.toMatch(/\/dashboard$/);
});

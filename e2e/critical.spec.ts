import { expect, Page, test } from "@playwright/test";
import { db } from "../src/lib/db";
import { createSaasCheckout } from "../src/lib/saas-checkout";
import { recordPayment } from "../src/lib/payment-service";

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
    "/dashboard/plano",
  ]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main.main").first()).toBeVisible();
  }
});



test("self-service owner signup provisions a Pro trial tenant", async ({ page }) => {
  const suffix = Date.now().toString();
  const email = `owner-${suffix}@example.local`;
  const slug = `escola-self-${suffix}`;
  const schoolName = `Escola Self Service ${suffix}`;
  let userId: string | null = null;
  let organizationId: string | null = null;

  try {
    await page.goto("/cadastro");
    await page.getByLabel("Seu nome").fill("Owner E2E");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("OwnerE2E123!");
    await page.getByRole("button", { name: "Começar período de teste" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Nome da escola").fill(schoolName);
    await page.getByLabel("Identificador").fill(slug);
    await page.getByLabel("E-mail institucional").fill(email);
    await page.getByLabel("Telefone").fill("(13) 99999-1111");
    await page.getByLabel("Plano inicial").selectOption("PRO");
    await page.getByRole("button", { name: "Criar escola e iniciar trial" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);

    const organization = await db.organization.findUnique({
      where: { slug },
      include: {
        subscription: true,
        schoolYears: true,
        memberships: {
          include: { user: true },
        },
        auditLogs: true,
      },
    });

    expect(organization).not.toBeNull();
    organizationId = organization!.id;

    const ownerMembership = organization!.memberships.find(
      (membership) =>
        membership.role === "SCHOOL_ADMIN" &&
        membership.user.email === email,
    );

    expect(ownerMembership).toBeTruthy();
    userId = ownerMembership!.userId;
    expect(organization!.subscription?.plan).toBe("PRO");
    expect(organization!.subscription?.status).toBe("TRIAL");
    expect(organization!.subscription?.seats).toBe(150);
    expect(organization!.subscription?.trialEndsAt).not.toBeNull();
    expect(organization!.schoolYears.some((year) => year.active)).toBe(true);
    expect(
      organization!.auditLogs.some(
        (log) => log.entity === "Organization" && log.action === "CREATE",
      ),
    ).toBe(true);
  } finally {
    if (organizationId) {
      await db.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    } else {
      await db.user.delete({ where: { email } }).catch(() => undefined);
    }
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

    await expect.poll(
      async () =>
        db.enrollment.count({
          where: {
            studentId: student!.id,
            active: true,
            classGroup: { schoolYear: { name: "2026" } },
          },
        }),
      { timeout: 5_000 },
    ).toBe(1);

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

test("concurrent duplicate payment is idempotent by external reference", async () => {
  const suffix = Date.now().toString();
  const registration = `PAY-${suffix}`;
  const externalReference = `E2E-IDEMP-${suffix}`;

  const [org, actor] = await Promise.all([
    db.organization.findUnique({ where: { slug: "escola-demo" } }),
    db.user.findUnique({
      where: {
        email: process.env.SEED_OWNER_EMAIL ?? "admin@classdiary.local",
      },
    }),
  ]);

  expect(org).not.toBeNull();
  expect(actor).not.toBeNull();

  let studentId: string | null = null;

  try {
    const student = await db.student.create({
      data: {
        organizationId: org!.id,
        name: `Pagamento Concorrente ${suffix}`,
        registration,
        active: true,
      },
    });
    studentId = student.id;

    const contract = await db.studentContract.create({
      data: {
        organizationId: org!.id,
        studentId: student.id,
        title: `Contrato Concorrente ${suffix}`,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        monthlyAmount: 199.9,
        status: "ACTIVE",
      },
    });

    const invoice = await db.invoice.create({
      data: {
        organizationId: org!.id,
        studentId: student.id,
        contractId: contract.id,
        reference: `${registration}-2026-11`,
        description: "Mensalidade 11/2026",
        dueAt: new Date("2026-11-10T12:00:00.000Z"),
        amount: 199.9,
        status: "OPEN",
      },
    });

    const input = {
      organizationId: org!.id,
      userId: actor!.id,
      invoiceId: invoice.id,
      amount: 199.9,
      method: "PIX" as const,
      externalReference,
    };

    const [first, second] = await Promise.all([
      recordPayment(input),
      recordPayment(input),
    ]);

    expect(first.invoiceId).toBe(invoice.id);
    expect(second.invoiceId).toBe(invoice.id);

    const [payments, receipts, finalInvoice] = await Promise.all([
      db.payment.count({ where: { invoiceId: invoice.id, externalReference } }),
      db.receipt.count({ where: { invoiceId: invoice.id } }),
      db.invoice.findUnique({ where: { id: invoice.id }, select: { status: true } }),
    ]);

    expect(payments).toBe(1);
    expect(receipts).toBe(1);
    expect(finalInvoice?.status).toBe("PAID");
  } finally {
    if (studentId) {
      await db.student.delete({ where: { id: studentId } }).catch(() => undefined);
    }
  }
});

test("SaaS checkout is idempotent under concurrent duplicate requests", async () => {
  const org = await db.organization.findUnique({
    where: { slug: "escola-demo" },
    include: { memberships: { take: 1 } },
  });
  expect(org).not.toBeNull();
  expect(org!.memberships.length).toBeGreaterThan(0);

  const key = `checkout-e2e-${Date.now()}`;
  let providerCalls = 0;
  const provider = {
    async createCheckout() {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        provider: "E2E_FAKE",
        externalReference: `provider-${key}`,
        checkoutUrl: "https://example.test/checkout",
      };
    },
  };

  try {
    const [first, second] = await Promise.all([
      createSaasCheckout({
        organizationId: org!.id,
        requestedByUserId: org!.memberships[0].userId,
        plan: "PRO",
        seats: 50,
        customerEmail: "billing-e2e@example.local",
        returnUrl: "http://127.0.0.1:3000/dashboard/plano",
        idempotencyKey: key,
        provider,
      }),
      createSaasCheckout({
        organizationId: org!.id,
        requestedByUserId: org!.memberships[0].userId,
        plan: "PRO",
        seats: 50,
        customerEmail: "billing-e2e@example.local",
        returnUrl: "http://127.0.0.1:3000/dashboard/plano",
        idempotencyKey: key,
        provider,
      }),
    ]);

    expect(first.id).toBe(second.id);
    expect(first.status).toBe("READY");
    expect(second.status).toBe("READY");
    expect(providerCalls).toBe(1);

    const rows = await db.billingCheckout.findMany({
      where: { idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("E2E_FAKE");
    expect(rows[0].checkoutUrl).toBe("https://example.test/checkout");
  } finally {
    await db.billingCheckout.deleteMany({
      where: { idempotencyKey: key },
    });
  }
});

test("trial lifecycle allows grace period and blocks mutations after grace", async ({ page }) => {
  const org = await db.organization.findUnique({
    where: { slug: "escola-demo" },
    include: { subscription: true },
  });
  expect(org?.subscription).not.toBeNull();

  const original = org!.subscription!;
  const graceName = `Aluno Grace ${Date.now()}`;
  const graceRegistration = `GRACE-${Date.now()}`;
  const blockedName = `Aluno Bloqueado ${Date.now()}`;
  const blockedRegistration = `BLOCK-${Date.now()}`;

  try {
    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    });

    await loginAsAdmin(page);
    await page.goto("/dashboard/plano");
    await expect(page.getByText("período de tolerância ativo", { exact: false })).toBeVisible();

    await page.goto("/dashboard/alunos");
    await page.locator('input[name="name"]').fill(graceName);
    await page.locator('input[name="registration"]').fill(graceRegistration);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText(graceName, { exact: true })).toBeVisible();

    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() - 4 * 86_400_000),
      },
    });

    await page.goto("/dashboard/alunos");
    await page.locator('input[name="name"]').fill(blockedName);
    await page.locator('input[name="registration"]').fill(blockedRegistration);
    await page.getByRole("button", { name: "Cadastrar" }).click().catch(() => undefined);
    await page.waitForTimeout(300);

    const blocked = await db.student.findFirst({
      where: { organizationId: org!.id, registration: blockedRegistration },
    });
    expect(blocked).toBeNull();
  } finally {
    await db.student.deleteMany({
      where: {
        organizationId: org!.id,
        registration: { in: [graceRegistration, blockedRegistration] },
      },
    });

    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        plan: original.plan,
        status: original.status,
        seats: original.seats,
        trialEndsAt: original.trialEndsAt,
        currentPeriodEnd: original.currentPeriodEnd,
      },
    });
  }
});

test("starter seat limit blocks a new teacher without orphaning a user", async ({ page }) => {
  const org = await db.organization.findUnique({
    where: { slug: "escola-demo" },
    include: { subscription: true },
  });
  expect(org?.subscription).not.toBeNull();

  const memberships = await db.membership.findMany({
    where: { organizationId: org!.id, user: { active: true } },
    distinct: ["userId"],
    select: { userId: true },
  });

  const original = org!.subscription!;
  const email = `quota-${Date.now()}@escolademo.local`;

  await db.subscription.update({
    where: { organizationId: org!.id },
    data: {
      plan: "STARTER",
      status: "ACTIVE",
      seats: memberships.length,
    },
  });

  try {
    await loginAsAdmin(page);

    await page.goto("/dashboard/plano");
    await expect(page.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(page.getByText("Alunos ativos", { exact: true })).toBeVisible();

    await page.goto("/dashboard/professores");
    await page.locator('input[name="name"]').fill("Professor Limite E2E");
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Adicionar professor" }).click().catch(() => undefined);
    await page.waitForTimeout(300);

    const [createdUser, createdMembership] = await Promise.all([
      db.user.findUnique({ where: { email } }),
      db.membership.findFirst({
        where: {
          organizationId: org!.id,
          user: { email },
        },
      }),
    ]);

    expect(createdUser).toBeNull();
    expect(createdMembership).toBeNull();
  } finally {
    await db.subscription.update({
      where: { organizationId: org!.id },
      data: {
        plan: original.plan,
        status: original.status,
        seats: original.seats,
        trialEndsAt: original.trialEndsAt,
        currentPeriodEnd: original.currentPeriodEnd,
      },
    });
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

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/rbac";

export async function createPublicEnrollmentLeadAction(fd: FormData) {
  const p = z.object({
    organizationSlug: z.string().min(1),
    studentName: z.string().min(2),
    birthDate: z.string().optional(),
    guardianName: z.string().min(2),
    guardianEmail: z.string().email().optional().or(z.literal("")),
    guardianPhone: z.string().min(8),
    desiredGrade: z.string().optional(),
    desiredShift: z.string().optional(),
    notes: z.string().optional(),
  }).parse({
    organizationSlug: String(fd.get("organizationSlug") ?? "").trim(),
    studentName: String(fd.get("studentName") ?? "").trim(),
    birthDate: String(fd.get("birthDate") ?? ""),
    guardianName: String(fd.get("guardianName") ?? "").trim(),
    guardianEmail: String(fd.get("guardianEmail") ?? "").trim().toLowerCase(),
    guardianPhone: String(fd.get("guardianPhone") ?? "").trim(),
    desiredGrade: String(fd.get("desiredGrade") ?? "").trim(),
    desiredShift: String(fd.get("desiredShift") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const org = await db.organization.findFirst({
    where: { slug: p.organizationSlug, active: true },
  });
  if (!org || org.slug === "classdiary-platform") {
    throw new Error("Escola inválida.");
  }

  await db.enrollmentLead.create({
    data: {
      organizationId: org.id,
      studentName: p.studentName,
      birthDate: p.birthDate ? new Date(p.birthDate) : null,
      guardianName: p.guardianName,
      guardianEmail: p.guardianEmail || null,
      guardianPhone: p.guardianPhone,
      desiredGrade: p.desiredGrade || null,
      desiredShift: p.desiredShift || null,
      notes: p.notes || null,
      source: "PUBLIC_FORM",
    },
  });

  revalidatePath(`/matricula/${org.slug}`);
}

export async function updateEnrollmentLeadStatusAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const p = z.object({
    id: z.string().min(1),
    status: z.enum(["PRE_ENROLLMENT", "WAITLIST", "APPROVED", "REJECTED", "CONVERTED"]),
  }).parse({
    id: String(fd.get("id") ?? ""),
    status: String(fd.get("status") ?? ""),
  });

  const lead = await db.enrollmentLead.findFirst({
    where: { id: p.id, organizationId: org.id },
  });
  if (!lead) throw new Error("Pré-inscrição inválida.");

  await db.enrollmentLead.update({
    where: { id: lead.id },
    data: { status: p.status },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "UPDATE",
      entity: "EnrollmentLead",
      entityId: lead.id,
      metadata: { status: p.status },
    },
  });

  revalidatePath("/dashboard/pre-inscricoes");
}

export async function convertEnrollmentLeadAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const leadId = z.string().min(1).parse(String(fd.get("id") ?? ""));
  const lead = await db.enrollmentLead.findFirst({
    where: { id: leadId, organizationId: org.id },
  });
  if (!lead) throw new Error("Pré-inscrição inválida.");

  if (lead.convertedStudentId) return;

  const registration = `PRE-${Date.now().toString().slice(-8)}`;

  const student = await db.student.create({
    data: {
      organizationId: org.id,
      name: lead.studentName,
      registration,
      birthDate: lead.birthDate,
      guardianName: lead.guardianName,
      guardianEmail: lead.guardianEmail,
      guardianPhone: lead.guardianPhone,
      active: true,
    },
  });

  await db.enrollmentLead.update({
    where: { id: lead.id },
    data: {
      status: "CONVERTED",
      convertedStudentId: student.id,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CONVERT",
      entity: "EnrollmentLead",
      entityId: lead.id,
      metadata: { studentId: student.id },
    },
  });

  revalidatePath("/dashboard/pre-inscricoes");
  revalidatePath("/dashboard/alunos");
}

export async function acceptStudentContractAction(fd: FormData) {
  const p = z.object({
    contractId: z.string().min(1),
    acceptedByName: z.string().min(2),
    acceptedByDocument: z.string().optional(),
  }).parse({
    contractId: String(fd.get("contractId") ?? ""),
    acceptedByName: String(fd.get("acceptedByName") ?? "").trim(),
    acceptedByDocument: String(fd.get("acceptedByDocument") ?? "").trim(),
  });

  const contract = await db.studentContract.findUnique({
    where: { id: p.contractId },
    include: { organization: true },
  });
  if (!contract || contract.status !== "ACTIVE") {
    throw new Error("Contrato inválido.");
  }

  const h = await headers();

  await db.contractAcceptance.upsert({
    where: { contractId: contract.id },
    update: {
      acceptedByName: p.acceptedByName,
      acceptedByDocument: p.acceptedByDocument || null,
      acceptedAt: new Date(),
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: h.get("user-agent"),
    },
    create: {
      organizationId: contract.organizationId,
      contractId: contract.id,
      studentId: contract.studentId,
      acceptedByName: p.acceptedByName,
      acceptedByDocument: p.acceptedByDocument || null,
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: h.get("user-agent"),
    },
  });

  revalidatePath(`/contrato/${contract.id}`);
}

export async function createCostCenterAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN"]);

  const p = z.object({
    name: z.string().min(2),
    code: z.string().optional(),
  }).parse({
    name: String(fd.get("name") ?? "").trim(),
    code: String(fd.get("code") ?? "").trim(),
  });

  const center = await db.costCenter.create({
    data: {
      organizationId: org.id,
      name: p.name,
      code: p.code || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "CostCenter",
      entityId: center.id,
    },
  });

  revalidatePath("/dashboard/financeiro/dre");
}

export async function createExpenseAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const p = z.object({
    costCenterId: z.string().optional(),
    description: z.string().min(2),
    category: z.string().min(2),
    amount: z.coerce.number().positive(),
    dueAt: z.string().min(1),
    supplier: z.string().optional(),
    notes: z.string().optional(),
  }).parse({
    costCenterId: String(fd.get("costCenterId") ?? "") || undefined,
    description: String(fd.get("description") ?? "").trim(),
    category: String(fd.get("category") ?? "").trim(),
    amount: fd.get("amount"),
    dueAt: String(fd.get("dueAt") ?? ""),
    supplier: String(fd.get("supplier") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const expense = await db.expense.create({
    data: {
      organizationId: org.id,
      costCenterId: p.costCenterId || null,
      description: p.description,
      category: p.category,
      amount: p.amount,
      dueAt: new Date(p.dueAt),
      supplier: p.supplier || null,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Expense",
      entityId: expense.id,
    },
  });

  revalidatePath("/dashboard/financeiro/dre");
}

export async function markExpensePaidAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const id = z.string().min(1).parse(String(fd.get("id") ?? ""));
  const expense = await db.expense.findFirst({
    where: { id, organizationId: org.id },
  });
  if (!expense) throw new Error("Despesa inválida.");

  await db.expense.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "PAY",
      entity: "Expense",
      entityId: id,
    },
  });

  revalidatePath("/dashboard/financeiro/dre");
}

export async function createRevenueAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const p = z.object({
    costCenterId: z.string().optional(),
    description: z.string().min(2),
    category: z.string().min(2),
    amount: z.coerce.number().positive(),
    receivedAt: z.string().min(1),
    source: z.string().optional(),
    notes: z.string().optional(),
  }).parse({
    costCenterId: String(fd.get("costCenterId") ?? "") || undefined,
    description: String(fd.get("description") ?? "").trim(),
    category: String(fd.get("category") ?? "").trim(),
    amount: fd.get("amount"),
    receivedAt: String(fd.get("receivedAt") ?? ""),
    source: String(fd.get("source") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim(),
  });

  const revenue = await db.revenue.create({
    data: {
      organizationId: org.id,
      costCenterId: p.costCenterId || null,
      description: p.description,
      category: p.category,
      amount: p.amount,
      receivedAt: new Date(p.receivedAt),
      source: p.source || null,
      notes: p.notes || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "CREATE",
      entity: "Revenue",
      entityId: revenue.id,
    },
  });

  revalidatePath("/dashboard/financeiro/dre");
}

export async function generateInvoicesBatchAction(fd: FormData) {
  const { user, org } = await requireSchoolRole(["SCHOOL_ADMIN", "SECRETARY"]);

  const month = z.coerce.number().int().min(1).max(12).parse(fd.get("month"));
  const year = z.coerce.number().int().min(2000).max(2100).parse(fd.get("year"));

  const [contracts, settings] = await Promise.all([
    db.studentContract.findMany({
      where: { organizationId: org.id, status: "ACTIVE" },
      include: { student: true },
    }),
    db.financialSettings.findUnique({ where: { organizationId: org.id } }),
  ]);

  const dueDay = settings?.defaultDueDay ?? 10;
  let generated = 0;

  for (const contract of contracts) {
    const amount = Number(contract.monthlyAmount);
    let discount = 0;

    if (contract.discountType === "PERCENT" && contract.discountValue) {
      discount = Math.min(amount, (amount * Number(contract.discountValue)) / 100);
    } else if (contract.discountType === "FIXED" && contract.discountValue) {
      discount = Math.min(amount, Number(contract.discountValue));
    }

    const reference = `${contract.student.registration}-${year}-${String(month).padStart(2, "0")}`;

    await db.invoice.upsert({
      where: {
        organizationId_reference: {
          organizationId: org.id,
          reference,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        studentId: contract.studentId,
        contractId: contract.id,
        reference,
        description: `Mensalidade ${String(month).padStart(2, "0")}/${year}`,
        dueAt: new Date(year, month - 1, dueDay, 12, 0, 0),
        amount,
        discountAmount: discount,
      },
    });

    generated += 1;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      action: "GENERATE_BATCH",
      entity: "Invoice",
      metadata: { month, year, generated },
    },
  });

  revalidatePath("/dashboard/financeiro/cobrancas");
}

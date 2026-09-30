import { db } from "@/lib/db";

export const REQUIRED_RETENTION_CATEGORIES = [
  "ACADEMIC",
  "FINANCIAL",
  "HEALTH",
  "COMMUNICATION",
  "AUDIT",
  "FILES",
] as const;

export const DEFAULT_RELEASE_ITEMS = [
  { code: "DB_MIGRATIONS", title: "Migrations aplicadas e schema validado", category: "DATABASE" },
  { code: "SECURITY_GUARDS", title: "Guards de mutação e isolamento validados", category: "SECURITY" },
  { code: "HEALTH_READY", title: "Health/readiness respondendo corretamente", category: "OBSERVABILITY" },
  { code: "BACKUP_VERIFIED", title: "Backup recente verificado", category: "BACKUP" },
  { code: "RESTORE_DRILL", title: "Restore drill recente validado", category: "BACKUP" },
  { code: "RETENTION_POLICIES", title: "Políticas internas de retenção definidas", category: "PRIVACY" },
  { code: "PRIVACY_REQUESTS", title: "Fluxo de solicitações de titulares operacional", category: "PRIVACY" },
  { code: "BILLING_READY", title: "Billing configurado e reconciliável", category: "APPLICATION" },
  { code: "NO_CRITICAL_INCIDENTS", title: "Sem incidentes críticos abertos", category: "OPERATIONS" },
] as const;

export type ReleaseReadinessCheck = {
  code: string;
  ok: boolean;
  detail: string;
};

export function evaluateReleaseChecks(input: {
  retentionCategories: string[];
  lastBackupStatus?: string | null;
  lastBackupAt?: Date | null;
  lastRestoreStatus?: string | null;
  lastRestoreAt?: Date | null;
  lastRestoreDataVerified?: boolean | null;
  criticalIncidents: number;
  billingConfigured: boolean;
  hasProviderSubscription: boolean;
  now?: Date;
}): ReleaseReadinessCheck[] {
  const now = input.now ?? new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const backupFresh =
    !!input.lastBackupAt &&
    now.getTime() - input.lastBackupAt.getTime() <= dayMs;
  const restoreFresh =
    !!input.lastRestoreAt &&
    now.getTime() - input.lastRestoreAt.getTime() <= 30 * dayMs;

  const retentionSet = new Set(input.retentionCategories);

  return [
    {
      code: "BACKUP_VERIFIED",
      ok: input.lastBackupStatus === "VERIFIED" && backupFresh,
      detail:
        input.lastBackupStatus === "VERIFIED" && backupFresh
          ? "Backup verificado nas últimas 24 horas."
          : "É necessário um backup VERIFIED com até 24 horas.",
    },
    {
      code: "RESTORE_DRILL",
      ok:
        input.lastRestoreStatus === "SUCCESS" &&
        input.lastRestoreDataVerified === true &&
        restoreFresh,
      detail:
        input.lastRestoreStatus === "SUCCESS" &&
        input.lastRestoreDataVerified === true &&
        restoreFresh
          ? "Restore drill validado nos últimos 30 dias."
          : "É necessário restore drill SUCCESS, com dados verificados, nos últimos 30 dias.",
    },
    {
      code: "RETENTION_POLICIES",
      ok: REQUIRED_RETENTION_CATEGORIES.every((item) => retentionSet.has(item)),
      detail: REQUIRED_RETENTION_CATEGORIES.every((item) => retentionSet.has(item))
        ? "Todas as categorias internas de retenção estão definidas."
        : "Faltam categorias de retenção obrigatórias para o checklist interno.",
    },
    {
      code: "BILLING_READY",
      ok: input.billingConfigured && input.hasProviderSubscription,
      detail:
        input.billingConfigured && input.hasProviderSubscription
          ? "Provider de billing configurado e assinatura externa vinculada."
          : "Billing ainda não está totalmente configurado/vinculado.",
    },
    {
      code: "NO_CRITICAL_INCIDENTS",
      ok: input.criticalIncidents === 0,
      detail:
        input.criticalIncidents === 0
          ? "Nenhum incidente crítico aberto."
          : `${input.criticalIncidents} incidente(s) crítico(s) aberto(s).`,
    },
  ];
}

export async function getReleaseReadinessSnapshot(organizationId: string) {
  const [policies, backup, restore, criticalIncidents, checkout] =
    await Promise.all([
      db.retentionPolicy.findMany({
        where: { organizationId, active: true },
        select: { dataCategory: true },
      }),
      db.backupVerification.findFirst({
        where: { organizationId },
        orderBy: { checkedAt: "desc" },
      }),
      db.restoreDrill.findFirst({
        where: { organizationId },
        orderBy: { startedAt: "desc" },
      }),
      db.incident.count({
        where: {
          organizationId,
          status: "OPEN",
          severity: "CRITICAL",
        },
      }),
      db.billingCheckout.findFirst({
        where: {
          organizationId,
          providerSubscriptionId: { not: null },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const billingConfigured =
    process.env.BILLING_PROVIDER?.trim().toLowerCase() === "mercado_pago" &&
    Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) &&
    Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim());

  const checks = evaluateReleaseChecks({
    retentionCategories: policies.map((item) => item.dataCategory),
    lastBackupStatus: backup?.status,
    lastBackupAt: backup?.checkedAt,
    lastRestoreStatus: restore?.status,
    lastRestoreAt: restore?.startedAt,
    lastRestoreDataVerified: restore?.dataVerified,
    criticalIncidents,
    billingConfigured,
    hasProviderSubscription: Boolean(checkout?.providerSubscriptionId),
  });

  return {
    ready: checks.every((item) => item.ok),
    checks,
  };
}

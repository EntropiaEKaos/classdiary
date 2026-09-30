CREATE TABLE "BillingCheckout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "externalReference" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCheckout_externalReference_key" ON "BillingCheckout"("externalReference");
CREATE INDEX "BillingCheckout_organizationId_createdAt_idx" ON "BillingCheckout"("organizationId", "createdAt");
CREATE INDEX "BillingCheckout_organizationId_status_idx" ON "BillingCheckout"("organizationId", "status");

ALTER TABLE "BillingCheckout"
ADD CONSTRAINT "BillingCheckout_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

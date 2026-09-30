ALTER TABLE "BillingCheckout"
ADD COLUMN "providerSubscriptionId" TEXT;

CREATE INDEX "BillingCheckout_provider_providerSubscriptionId_idx"
ON "BillingCheckout"("provider", "providerSubscriptionId");

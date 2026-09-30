export type CheckoutRequest = {
  organizationId: string;
  externalReference: string;
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  seats: number;
  customerEmail?: string | null;
  returnUrl: string;
};

export type CheckoutSession = {
  provider: string;
  externalReference: string;
  checkoutUrl: string;
};

export type BillingWebhookEvent = {
  provider: string;
  providerEventId: string;
  type: "CHECKOUT_APPROVED" | "PAYMENT_FAILED" | "SUBSCRIPTION_CANCELED";
  externalReference: string;
  payload?: Record<string, unknown>;
};

export interface BillingProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  verifyWebhook?(
    body: string,
    headers: Headers,
  ): Promise<BillingWebhookEvent>;
}

class UnconfiguredBillingProvider implements BillingProvider {
  async createCheckout(): Promise<CheckoutSession> {
    throw new Error("Gateway de cobrança ainda não configurado.");
  }
}

export function getBillingProvider(): BillingProvider {
  return new UnconfiguredBillingProvider();
}

export type CheckoutRequest = {
  organizationId: string;
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

export interface BillingProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
}

class UnconfiguredBillingProvider implements BillingProvider {
  async createCheckout(): Promise<CheckoutSession> {
    throw new Error("Gateway de cobrança ainda não configurado.");
  }
}

export function getBillingProvider(): BillingProvider {
  return new UnconfiguredBillingProvider();
}

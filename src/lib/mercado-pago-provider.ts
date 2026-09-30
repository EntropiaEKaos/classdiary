import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutRequest,
  CheckoutSession,
  WebhookContext,
} from "@/lib/billing-provider";

type FetchLike = typeof fetch;

export type MercadoPagoConfig = {
  accessToken: string;
  webhookSecret: string;
  prices: Record<CheckoutRequest["plan"], number>;
};

type PreapprovalResponse = {
  id?: string;
  init_point?: string;
  status?: string;
  external_reference?: string;
  next_payment_date?: string;
};

type AuthorizedPaymentResponse = {
  id?: number | string;
  preapproval_id?: string;
  external_reference?: string;
  status?: string;
  summarized?: string;
  payment?: {
    id?: number | string;
    status?: string;
    status_detail?: string;
  };
};

function parsePositiveAmount(value: string | undefined, name: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${name} precisa ser um valor positivo em BRL.`);
  }
  return amount;
}

export function mercadoPagoConfigFromEnv(): MercadoPagoConfig {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();

  if (!accessToken || !webhookSecret) {
    throw new Error("Credenciais do Mercado Pago não configuradas.");
  }

  return {
    accessToken,
    webhookSecret,
    prices: {
      STARTER: parsePositiveAmount(
        process.env.MERCADO_PAGO_PRICE_STARTER_BRL,
        "MERCADO_PAGO_PRICE_STARTER_BRL",
      ),
      PRO: parsePositiveAmount(
        process.env.MERCADO_PAGO_PRICE_PRO_BRL,
        "MERCADO_PAGO_PRICE_PRO_BRL",
      ),
      ENTERPRISE: parsePositiveAmount(
        process.env.MERCADO_PAGO_PRICE_ENTERPRISE_BRL,
        "MERCADO_PAGO_PRICE_ENTERPRISE_BRL",
      ),
    },
  };
}

export class MercadoPagoBillingProvider implements BillingProvider {
  constructor(
    private readonly config: MercadoPagoConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!request.customerEmail) {
      throw new Error("E-mail do responsável pela cobrança é obrigatório.");
    }

    const response = await this.fetcher(
      "https://api.mercadopago.com/preapproval",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": request.externalReference,
        },
        body: JSON.stringify({
          reason: `ClassDiary ${request.plan}`,
          external_reference: request.externalReference,
          payer_email: request.customerEmail,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: this.config.prices[request.plan],
            currency_id: "BRL",
          },
          back_url: request.returnUrl,
          status: "pending",
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Mercado Pago recusou a criação da assinatura (${response.status}): ${text.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as PreapprovalResponse;
    if (!data.id || !data.init_point) {
      throw new Error("Mercado Pago não retornou ID e URL da assinatura.");
    }

    return {
      provider: "MERCADO_PAGO",
      providerSubscriptionId: data.id,
      externalReference: request.externalReference,
      checkoutUrl: data.init_point,
    };
  }

  private async fetchPreapproval(id: string) {
    const response = await this.fetcher(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Não foi possível consultar a assinatura no Mercado Pago (${response.status}).`,
      );
    }

    return (await response.json()) as PreapprovalResponse;
  }

  private assertSignature(headers: Headers, dataId: string) {
    const xSignature = headers.get("x-signature");
    const xRequestId = headers.get("x-request-id");

    if (!xSignature || !xRequestId) {
      throw new Error("Webhook Mercado Pago sem assinatura ou request id.");
    }

    const parts = new Map(
      xSignature.split(",").map((part) => {
        const [key, ...rest] = part.trim().split("=");
        return [key, rest.join("=")];
      }),
    );
    const ts = parts.get("ts");
    const v1 = parts.get("v1");
    if (!ts || !v1) {
      throw new Error("Assinatura Mercado Pago inválida.");
    }

    const manifest =
      `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(manifest)
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(v1, "utf8");
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new Error("Assinatura Mercado Pago não confere.");
    }

    return xRequestId;
  }

  async reconcileSubscription(input: {
    providerSubscriptionId: string;
    externalReference: string;
  }): Promise<BillingWebhookEvent> {
    const resource = await this.fetchPreapproval(input.providerSubscriptionId);

    if (
      resource.external_reference &&
      resource.external_reference !== input.externalReference
    ) {
      throw new Error("Referência externa da assinatura não confere.");
    }

    const status = resource.status?.toLowerCase();
    let type: BillingWebhookEvent["type"] = "NOOP";
    if (status === "authorized") type = "CHECKOUT_APPROVED";
    if (status === "canceled") type = "SUBSCRIPTION_CANCELED";

    return {
      provider: "MERCADO_PAGO",
      providerEventId:
        `mp:reconcile:${input.providerSubscriptionId}:${status ?? "unknown"}:${resource.next_payment_date ?? "none"}`,
      type,
      externalReference: input.externalReference,
      providerSubscriptionId: input.providerSubscriptionId,
      periodEnd: resource.next_payment_date ?? null,
      payload: {
        source: "reconciliation",
        resourceId: input.providerSubscriptionId,
        resourceStatus: resource.status ?? null,
      },
    };
  }

  async verifyWebhook(
    body: string,
    headers: Headers,
    context: WebhookContext,
  ): Promise<BillingWebhookEvent> {
    const dataId = context.dataId?.trim();
    if (!dataId) {
      throw new Error("Webhook Mercado Pago sem data.id.");
    }

    const xRequestId = this.assertSignature(headers, dataId);

    let notification: { type?: string; action?: string; id?: string } = {};
    try {
      notification = JSON.parse(body) as typeof notification;
    } catch {
      throw new Error("Payload Mercado Pago inválido.");
    }

    const topic = context.topic ?? notification.type ?? null;

    if (topic === "subscription_preapproval") {
      const resource = await this.fetchPreapproval(dataId);
      if (!resource.external_reference) {
        throw new Error("Assinatura Mercado Pago sem external_reference.");
      }

      const status = resource.status?.toLowerCase();
      let type: BillingWebhookEvent["type"] = "NOOP";
      if (status === "authorized") type = "CHECKOUT_APPROVED";
      if (status === "canceled") type = "SUBSCRIPTION_CANCELED";

      return {
        provider: "MERCADO_PAGO",
        providerEventId:
          `mp:${notification.id ?? xRequestId}:${notification.action ?? status ?? "unknown"}:${dataId}`,
        type,
        externalReference: resource.external_reference,
        providerSubscriptionId: resource.id ?? dataId,
        periodEnd: resource.next_payment_date ?? null,
        payload: {
          topic,
          action: notification.action ?? null,
          resourceId: dataId,
          resourceStatus: resource.status ?? null,
        },
      };
    }

    if (topic === "subscription_authorized_payment") {
      const invoiceResponse = await this.fetcher(
        `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(dataId)}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!invoiceResponse.ok) {
        throw new Error(
          `Não foi possível consultar a fatura no Mercado Pago (${invoiceResponse.status}).`,
        );
      }

      const invoice = (await invoiceResponse.json()) as AuthorizedPaymentResponse;
      if (!invoice.external_reference) {
        throw new Error("Fatura Mercado Pago sem external_reference.");
      }

      let preapproval: PreapprovalResponse | null = null;
      if (invoice.preapproval_id) {
        preapproval = await this.fetchPreapproval(invoice.preapproval_id);
      }

      const paymentStatus = invoice.payment?.status?.toLowerCase();
      let type: BillingWebhookEvent["type"] = "NOOP";
      if (paymentStatus === "approved") type = "PAYMENT_RENEWED";
      if (paymentStatus === "rejected") type = "PAYMENT_FAILED";

      return {
        provider: "MERCADO_PAGO",
        providerEventId:
          `mp:authorized-payment:${invoice.id ?? dataId}:${paymentStatus ?? invoice.status ?? "unknown"}`,
        type,
        externalReference: invoice.external_reference,
        providerSubscriptionId: invoice.preapproval_id ?? null,
        periodEnd: preapproval?.next_payment_date ?? null,
        payload: {
          topic,
          action: notification.action ?? null,
          authorizedPaymentId: invoice.id ?? dataId,
          paymentId: invoice.payment?.id ?? null,
          paymentStatus: invoice.payment?.status ?? null,
          paymentStatusDetail: invoice.payment?.status_detail ?? null,
          invoiceStatus: invoice.status ?? null,
          summarized: invoice.summarized ?? null,
        },
      };
    }

    throw new Error("Tópico Mercado Pago ainda não suportado neste endpoint.");
  }
}

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

type MercadoPagoConfig = {
  accessToken: string;
  webhookSecret: string;
  prices: Record<CheckoutRequest["plan"], number>;
};

type PreapprovalResponse = {
  id?: string;
  init_point?: string;
  status?: string;
  external_reference?: string;
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
      externalReference: request.externalReference,
      checkoutUrl: data.init_point,
    };
  }

  async verifyWebhook(
    body: string,
    headers: Headers,
    context: WebhookContext,
  ): Promise<BillingWebhookEvent> {
    const xSignature = headers.get("x-signature");
    const xRequestId = headers.get("x-request-id");
    const dataId = context.dataId?.trim();

    if (!xSignature || !xRequestId || !dataId) {
      throw new Error("Webhook Mercado Pago sem assinatura, request id ou data.id.");
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

    const normalizedDataId = dataId.toLowerCase();
    const manifest =
      `id:${normalizedDataId};request-id:${xRequestId};ts:${ts};`;
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

    let notification: { type?: string; action?: string; id?: string } = {};
    try {
      notification = JSON.parse(body) as typeof notification;
    } catch {
      throw new Error("Payload Mercado Pago inválido.");
    }

    if (
      context.topic &&
      context.topic !== "subscription_preapproval" &&
      notification.type !== "subscription_preapproval"
    ) {
      throw new Error("Tópico Mercado Pago ainda não suportado neste endpoint.");
    }

    const resourceResponse = await this.fetcher(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!resourceResponse.ok) {
      throw new Error(
        `Não foi possível consultar a assinatura no Mercado Pago (${resourceResponse.status}).`,
      );
    }

    const resource = (await resourceResponse.json()) as PreapprovalResponse;
    if (!resource.external_reference) {
      throw new Error("Assinatura Mercado Pago sem external_reference.");
    }

    const status = resource.status?.toLowerCase();
    let type: BillingWebhookEvent["type"];
    if (status === "authorized") {
      type = "CHECKOUT_APPROVED";
    } else if (status === "canceled") {
      type = "SUBSCRIPTION_CANCELED";
    } else {
      type = "NOOP";
    }

    return {
      provider: "MERCADO_PAGO",
      providerEventId:
        `mp:${notification.id ?? xRequestId}:${notification.action ?? status ?? "unknown"}:${dataId}`,
      type,
      externalReference: resource.external_reference,
      payload: {
        topic: context.topic ?? notification.type ?? null,
        action: notification.action ?? null,
        resourceId: dataId,
        resourceStatus: resource.status ?? null,
      },
    };
  }
}

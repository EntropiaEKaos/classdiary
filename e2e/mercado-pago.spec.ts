import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { MercadoPagoBillingProvider } from "../src/lib/mercado-pago-provider";

test("Mercado Pago provider creates pending monthly subscription from configured plan price", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        id: "preapproval-123",
        init_point: "https://www.mercadopago.com.br/subscriptions/checkout",
        status: "pending",
        external_reference: "SAAS-test-reference",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const provider = new MercadoPagoBillingProvider(
    {
      accessToken: "TEST-access-token",
      webhookSecret: "webhook-secret",
      prices: {
        STARTER: 49.9,
        PRO: 99.9,
        ENTERPRISE: 199.9,
      },
    },
    fakeFetch,
  );

  const session = await provider.createCheckout({
    organizationId: "org-e2e",
    externalReference: "SAAS-test-reference",
    plan: "PRO",
    seats: 80,
    customerEmail: "owner@example.local",
    returnUrl: "https://app.example.local/dashboard/plano",
  });

  expect(session.provider).toBe("MERCADO_PAGO");
  expect(session.externalReference).toBe("SAAS-test-reference");
  expect(session.checkoutUrl).toContain("mercadopago.com.br");
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://api.mercadopago.com/preapproval");

  const headers = new Headers(calls[0].init?.headers);
  expect(headers.get("authorization")).toBe("Bearer TEST-access-token");
  expect(headers.get("x-idempotency-key")).toBe("SAAS-test-reference");

  const body = JSON.parse(String(calls[0].init?.body));
  expect(body.external_reference).toBe("SAAS-test-reference");
  expect(body.payer_email).toBe("owner@example.local");
  expect(body.status).toBe("pending");
  expect(body.auto_recurring).toEqual({
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 99.9,
    currency_id: "BRL",
  });
});

test("Mercado Pago webhook validates HMAC and reads preapproval before activating", async () => {
  const dataId = "PREAPPROVAL123";
  const requestId = "request-123";
  const ts = "1790790000";
  const secret = "webhook-secret";
  const manifest =
    `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const signature = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe(
      "https://api.mercadopago.com/preapproval/PREAPPROVAL123",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer TEST-access-token");

    return new Response(
      JSON.stringify({
        id: dataId,
        status: "authorized",
        external_reference: "SAAS-checkout-reference",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const provider = new MercadoPagoBillingProvider(
    {
      accessToken: "TEST-access-token",
      webhookSecret: secret,
      prices: {
        STARTER: 49.9,
        PRO: 99.9,
        ENTERPRISE: 199.9,
      },
    },
    fakeFetch,
  );

  const headers = new Headers({
    "x-request-id": requestId,
    "x-signature": `ts=${ts},v1=${signature}`,
  });

  const event = await provider.verifyWebhook!(
    JSON.stringify({
      id: "notification-123",
      type: "subscription_preapproval",
      action: "updated",
      data: { id: dataId },
    }),
    headers,
    {
      dataId,
      topic: "subscription_preapproval",
    },
  );

  expect(event.provider).toBe("MERCADO_PAGO");
  expect(event.type).toBe("CHECKOUT_APPROVED");
  expect(event.externalReference).toBe("SAAS-checkout-reference");
  expect(event.providerEventId).toContain("notification-123");
});

test("Mercado Pago webhook rejects an invalid signature before any API lookup", async () => {
  let fetchCalls = 0;
  const fakeFetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const provider = new MercadoPagoBillingProvider(
    {
      accessToken: "TEST-access-token",
      webhookSecret: "correct-secret",
      prices: {
        STARTER: 49.9,
        PRO: 99.9,
        ENTERPRISE: 199.9,
      },
    },
    fakeFetch,
  );

  await expect(
    provider.verifyWebhook!(
      JSON.stringify({
        id: "notification-456",
        type: "subscription_preapproval",
      }),
      new Headers({
        "x-request-id": "request-456",
        "x-signature": "ts=1790790001,v1=deadbeef",
      }),
      {
        dataId: "preapproval456",
        topic: "subscription_preapproval",
      },
    ),
  ).rejects.toThrow("Assinatura Mercado Pago não confere.");

  expect(fetchCalls).toBe(0);
});

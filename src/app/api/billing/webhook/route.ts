import { NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing-provider";
import { processBillingWebhookEvent } from "@/lib/billing-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provider = getBillingProvider();
  if (!provider.verifyWebhook) {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = await request.text();
    const event = await provider.verifyWebhook(body, request.headers);
    const result = await processBillingWebhookEvent(event);

    return NextResponse.json(
      { status: "ok", duplicated: result.duplicated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("billing_webhook_failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json(
      { status: "rejected" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

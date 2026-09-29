import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "classdiary",
    timestamp: new Date().toISOString(),
  });
}

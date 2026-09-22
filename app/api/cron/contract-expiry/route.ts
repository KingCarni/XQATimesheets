import { NextResponse } from "next/server";

import { runContractExpirySweep } from "@/lib/notifications/contract-sweep";

/**
 * MHV-13 contract expiry sweep endpoint. Uses the same `CRON_SECRET`
 * bearer pattern as `/api/cron/cutoff-notifications` — one auth model,
 * two clearly-scoped routes so responsibilities stay distinct in dashboards
 * and logs. Idempotent via `contractDedupeKey`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runContractExpirySweep(new Date());
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

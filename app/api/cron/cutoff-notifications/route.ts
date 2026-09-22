import { NextResponse } from "next/server";

import { runCutoffNotificationSweep } from "@/lib/notifications/cutoff-sweep";

/**
 * MHV-4 + MHV-3 recurring sweep endpoint. Protected by `CRON_SECRET` so it
 * is not publicly triggerable. Vercel Cron sends the secret via the
 * `Authorization: Bearer <CRON_SECRET>` header when configured.
 *
 * Idempotent — safe to run more than once per interval (dedupe keys prevent
 * duplicate notifications).
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
  const result = await runCutoffNotificationSweep(new Date());
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

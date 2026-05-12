import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { saveAuditEvent } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = getCurrentUser(request);
  if (user) await saveAuditEvent("logout", user);
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}

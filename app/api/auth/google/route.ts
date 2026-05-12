import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie, verifyGoogleCredential } from "@/lib/auth";
import { saveAuditEvent } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { credential } = await request.json();
    if (!credential) {
      return NextResponse.json({ error: "Missing Google credential." }, { status: 400 });
    }
    const user = await verifyGoogleCredential(credential);
    const token = createSessionToken(user);
    await saveAuditEvent("login.google", user, { email: user.email });
    return NextResponse.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Google login failed." }, { status: 401 });
  }
}

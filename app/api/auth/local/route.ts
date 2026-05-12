import { NextResponse } from "next/server";
import { AuthUser, createSessionToken, sessionCookie } from "@/lib/auth";
import { saveAuditEvent } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { name, email, password, mode } = await request.json();
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const isAdminAttempt = mode === "admin" || cleanEmail === "admin@ai";
    if (isAdminAttempt) {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@ai";
      const adminPassword = process.env.ADMIN_PASSWORD || "123456789";
      if (cleanEmail !== adminEmail || String(password || "") !== adminPassword) {
        return NextResponse.json({ error: "Invalid admin email or password." }, { status: 401 });
      }
      const user: AuthUser = {
        id: `admin:${cleanEmail}`,
        name: "MONARCS Admin",
        email: cleanEmail,
        method: "local",
        role: "admin"
      };
      const token = createSessionToken(user);
      await saveAuditEvent("login.admin", user, { email: user.email });
      return NextResponse.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
    }

    if (!cleanName || !cleanEmail) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    const user: AuthUser = {
      id: `local:${cleanEmail}`,
      name: cleanName,
      email: cleanEmail,
      method: "local",
      role: "user"
    };
    const token = createSessionToken(user);
    await saveAuditEvent("login.local", user, { email: user.email });
    return NextResponse.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Login failed." }, { status: 500 });
  }
}

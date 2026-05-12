import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAuditEvents } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);
    return NextResponse.json({ events: await listAuditEvents(limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not load audit log." }, { status: 500 });
  }
}

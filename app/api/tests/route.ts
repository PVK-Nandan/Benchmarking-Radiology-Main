import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listReportTests } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!getCurrentUser(request)) return NextResponse.json({ error: "Login required." }, { status: 401 });
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const tests = await listReportTests(Math.min(Math.max(limit, 1), 100));
    return NextResponse.json({ tests });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not load saved tests." }, { status: 500 });
  }
}

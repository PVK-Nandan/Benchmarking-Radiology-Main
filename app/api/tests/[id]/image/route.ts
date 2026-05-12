import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { listReportTests } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const test = (await listReportTests(100)).find((item) => item.id === id);
    if (!test) return NextResponse.json({ error: "Test not found." }, { status: 404 });
    if (test.image_url) return NextResponse.redirect(test.image_url);
    if (!test.image_path) return NextResponse.json({ error: "No image saved for this test." }, { status: 404 });
    const file = await readFile(test.image_path);
    return new Response(file, {
      headers: {
        "Content-Type": test.image_type || "application/octet-stream",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Could not load image." }, { status: 500 });
  }
}

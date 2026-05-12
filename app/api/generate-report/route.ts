import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateVisionText } from "@/lib/llm";
import { referenceReportPrompt } from "@/lib/reportPrompt";
import { saveAuditEvent } from "@/lib/storage";
import { Provider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before generating a report." }, { status: 401 });
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    const provider = (form.get("provider")?.toString() || process.env.DEFAULT_REPORT_PROVIDER || "openai") as Provider;
    const model = form.get("model")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const report = await generateVisionText({
      provider,
      model,
      apiKey,
      base64,
      mimeType: image.type || "image/jpeg",
      prompt: referenceReportPrompt(image.name)
    });
    await saveAuditEvent("report.reference_generate", actor, { image: image.name, model });
    return NextResponse.json({ report });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Report generation failed." }, { status: 500 });
  }
}

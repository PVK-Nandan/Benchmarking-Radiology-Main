import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateVisionText } from "@/lib/llm";
import { dicomAbnormalityPrompt } from "@/lib/reportPrompt";
import { saveAuditEvent } from "@/lib/storage";
import { Provider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before running analysis." }, { status: 401 });
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Viewer screenshot or exported key image is required." }, { status: 400 });
    }
    if (image.type && !image.type.startsWith("image/")) {
      return NextResponse.json({
        error: "Upload a PNG/JPG/WebP screenshot or exported key image. Raw .dcm files must be opened in the DICOM viewer first."
      }, { status: 400 });
    }

    const provider = (form.get("provider")?.toString() || process.env.DEFAULT_REPORT_PROVIDER || "openai") as Provider;
    const model = form.get("model")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const clinicalQuestion = form.get("clinicalQuestion")?.toString() || "";
    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");

    const review = await generateVisionText({
      provider,
      model,
      apiKey,
      base64,
      mimeType: image.type || "image/png",
      prompt: dicomAbnormalityPrompt(image.name, clinicalQuestion)
    });

    await saveAuditEvent("dicom.image_review", actor, { image: image.name, clinicalQuestion });
    return NextResponse.json({ review });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "DICOM abnormality review failed." }, { status: 500 });
  }
}

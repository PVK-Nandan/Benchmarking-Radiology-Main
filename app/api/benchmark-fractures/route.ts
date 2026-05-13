import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateVisionText } from "@/lib/llm";
import { saveAuditEvent } from "@/lib/storage";
import {
  calculateFractureMetrics,
  findFractureCase,
  FractureBenchmarkCase,
  FracturePrediction,
  normalizeBoxes,
  parseFractureCaseJson,
  scoreFractureCase
} from "@/lib/fractureBenchmark";
import { Provider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function promptForFracture(fileName: string) {
  return `You are assisting with a research-only bone fracture localization benchmark for X-ray images.

Image file: ${fileName}

Return only a JSON object with this exact shape:
{
  "file_name": "${fileName}",
  "mura_region": "shoulder|humerus|elbow|forearm|wrist|hand|finger|unknown",
  "predicted_fracture": "fracture|no fracture|unknown",
  "predicted_fracture_type": "short fracture type, e.g. distal radius, scaphoid, metacarpal, phalanx, radial head, olecranon, humeral shaft, clavicle, or unknown",
  "predicted_fracture_count": 0,
  "boxes": [{"x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100}],
  "confidence": 0-100,
  "visible_findings": ["short visible radiographic findings"],
  "rationale": "brief reasoning based only on visible X-ray evidence",
  "warnings": ["limitations or uncertainty"]
}

Bounding-box rules:
- Coordinates must be percentages of the image size.
- Box the visible fracture line, cortical break, fragment, or most suspicious localized fracture region.
- Return one box per visible fracture. If no fracture is visible, return an empty boxes array.
- Do not invent patient identifiers. Do not give clinical clearance.`;
}

function parsePrediction(text: string, fileName: string): FracturePrediction {
  const jsonText = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);
  return {
    file_name: String(parsed.file_name || fileName),
    mura_region: String(parsed.mura_region || "unknown"),
    predicted_fracture: String(parsed.predicted_fracture || "unknown"),
    predicted_fracture_type: String(parsed.predicted_fracture_type || "unknown"),
    predicted_fracture_count: Math.max(0, Math.round(Number(parsed.predicted_fracture_count) || 0)),
    boxes: normalizeBoxes(parsed.boxes || []),
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
    visible_findings: Array.isArray(parsed.visible_findings) ? parsed.visible_findings.map(String) : [],
    rationale: String(parsed.rationale || ""),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
  };
}

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before running a benchmark." }, { status: 401 });

    const form = await request.formData();
    const files = form.getAll("images").filter((item): item is File => item instanceof File);
    if (files.length !== 10) {
      return NextResponse.json({ error: "Upload exactly 10 X-ray images for this fracture benchmark." }, { status: 400 });
    }

    const metadataJson = form.get("caseJson")?.toString() || "";
    if (!metadataJson.trim()) {
      return NextResponse.json({ error: "Add ground-truth case JSON with fracture type, fracture count, and bounding boxes." }, { status: 400 });
    }

    const groundTruthCases = parseFractureCaseJson(metadataJson);
    const provider = (form.get("provider")?.toString() || process.env.DEFAULT_REPORT_PROVIDER || "openai") as Provider;
    const model = form.get("model")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const cases: FractureBenchmarkCase[] = [];
    const errors: string[] = [];

    for (const image of files) {
      if (image.type && !image.type.startsWith("image/")) {
        errors.push(`${image.name}: skipped because it is not an image file.`);
        continue;
      }

      const groundTruth = findFractureCase(image.name, groundTruthCases);
      if (!groundTruth) {
        errors.push(`${image.name}: no matching ground-truth JSON case.`);
        continue;
      }

      try {
        const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
        const text = await generateVisionText({
          provider,
          model,
          apiKey,
          base64,
          mimeType: image.type || "image/png",
          prompt: promptForFracture(image.name),
          temperature: 0
        });
        const prediction = parsePrediction(text, image.name);
        cases.push({
          file_name: image.name,
          ground_truth: groundTruth,
          prediction,
          scores: scoreFractureCase(groundTruth, prediction)
        });
      } catch (error: any) {
        errors.push(`${image.name}: ${error.message || "prediction failed"}`);
      }
    }

    const metrics = calculateFractureMetrics(cases);
    const payload = {
      summary: `Evaluated ${cases.length}/10 fracture localization case(s). Overall ${metrics.overall_score}%, mIoU ${metrics.localization_miou}%, type ${metrics.fracture_type_accuracy}%, count ${metrics.fracture_count_accuracy}%.`,
      metrics,
      cases,
      scoring: [
        { metric: "Localization mIoU", weight: 45, description: "Compares each ground-truth fracture box with the best predicted box using intersection-over-union." },
        { metric: "Fracture type accuracy", weight: 20, description: "Checks whether the predicted fracture subtype matches the ground-truth subtype." },
        { metric: "Fracture count accuracy", weight: 15, description: "Scores whether the predicted number of fractures matches the JSON fracture_count." },
        { metric: "Detection accuracy", weight: 15, description: "Checks fracture vs no-fracture detection for each case." },
        { metric: "Confidence alignment", weight: 5, description: "Rewards calibrated high confidence when a fracture is detected." }
      ],
      guidance: [
        "The built-in sample uses FracAtlas images because FracAtlas includes fracture localization annotations.",
        "MURA can still be used for uploaded X-rays, but MURA does not ship fracture bounding boxes; provide JSON boxes when using MURA images.",
        "Keep box coordinates as percentages so the JSON remains portable across image sizes.",
        "Review low-IoU cases visually before trusting the aggregate score."
      ],
      errors
    };

    await saveAuditEvent("fracture.localization_benchmark", actor, {
      image_count: files.length,
      scored_cases: cases.length,
      overall_score: metrics.overall_score,
      localization_miou: metrics.localization_miou
    });
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Fracture benchmark failed." }, { status: 500 });
  }
}

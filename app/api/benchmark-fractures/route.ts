import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { generateVisionText } from "@/lib/llm";
import { saveAuditEvent } from "@/lib/storage";
import { FRACTURE_GROUND_TRUTH } from "@/lib/fracture-ground-truth";
import {
  calculateFractureMetrics,
  FractureBenchmarkCase,
  FracturePrediction,
  normalizeBoxes,
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
  "mura_region": "shoulder|humerus|elbow|forearm|wrist|hand|finger|hip|leg|unknown",
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

function parseUserPredictions(json: string): FracturePrediction[] {
  const parsed = JSON.parse(json);
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cases) ? parsed.cases : [];
  return rows.map((row: any) => ({
    file_name: String(row.file_name || ""),
    mura_region: String(row.mura_region || "unknown"),
    predicted_fracture: String(row.predicted_fracture || "unknown"),
    predicted_fracture_type: String(row.predicted_fracture_type || "unknown"),
    predicted_fracture_count: Math.max(0, Math.round(Number(row.predicted_fracture_count) || 0)),
    boxes: normalizeBoxes(row.boxes || []),
    confidence: Math.max(0, Math.min(100, Math.round(Number(row.confidence) || 80))),
    visible_findings: Array.isArray(row.visible_findings) ? row.visible_findings.map(String) : [],
    rationale: String(row.rationale || "User-provided prediction"),
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : []
  })).filter((p) => p.file_name);
}

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before running a benchmark." }, { status: 401 });

    const form = await request.formData();
    const provider = (form.get("provider")?.toString() || process.env.DEFAULT_REPORT_PROVIDER || "openai") as Provider;
    const model = form.get("model")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const userPredictionsJson = form.get("userPredictions")?.toString() || "";
    const cases: FractureBenchmarkCase[] = [];
    const errors: string[] = [];

    if (userPredictionsJson.trim()) {
      // Manual mode — user uploaded their own model's predictions
      const predictions = parseUserPredictions(userPredictionsJson);
      for (const gt of FRACTURE_GROUND_TRUTH) {
        const prediction = predictions.find((p) =>
          p.file_name.toLowerCase().includes(gt.file_name.toLowerCase()) ||
          gt.file_name.toLowerCase().includes(p.file_name.toLowerCase())
        );
        if (!prediction) {
          errors.push(`${gt.file_name}: no matching prediction found in uploaded JSON.`);
          continue;
        }
        cases.push({ file_name: gt.file_name, ground_truth: gt, prediction, scores: scoreFractureCase(gt, prediction) });
      }
    } else {
      // AI mode — run the built-in model on each image
    for (const gt of FRACTURE_GROUND_TRUTH) {
      try {
        const imagePath = path.join(process.cwd(), "public", "fracture-samples", gt.file_name);
        const buffer = await readFile(imagePath);
        const base64 = buffer.toString("base64");

        const text = await generateVisionText({
          provider,
          model,
          apiKey,
          base64,
          mimeType: "image/jpeg",
          prompt: promptForFracture(gt.file_name),
          temperature: 0
        });

        const prediction = parsePrediction(text, gt.file_name);
        cases.push({
          file_name: gt.file_name,
          ground_truth: gt,
          prediction,
          scores: scoreFractureCase(gt, prediction)
        });
      } catch (error: any) {
        errors.push(`${gt.file_name}: ${error.message || "prediction failed"}`);
      }
    }
    } // end AI mode

    const mode = userPredictionsJson.trim() ? "manual" : "ai";
    const metrics = calculateFractureMetrics(cases);
    const payload = {
      summary: `[${mode === "manual" ? "Your Model" : "Built-in AI"}] Evaluated ${cases.length}/10 case(s). Overall ${metrics.overall_score}%, mIoU ${metrics.localization_miou}%, type ${metrics.fracture_type_accuracy}%, count ${metrics.fracture_count_accuracy}%.`,
      metrics,
      cases,
      groundTruth: FRACTURE_GROUND_TRUTH,
      scoring: [
        { metric: "Localization mIoU", weight: 45, description: "Compares each ground-truth fracture box with the best predicted box using intersection-over-union." },
        { metric: "Fracture type accuracy", weight: 20, description: "Checks whether the predicted fracture subtype matches the ground-truth subtype." },
        { metric: "Fracture count accuracy", weight: 15, description: "Scores whether the predicted number of fractures matches the ground-truth fracture_count." },
        { metric: "Detection accuracy", weight: 15, description: "Checks fracture vs no-fracture detection for each case." },
        { metric: "Confidence alignment", weight: 5, description: "Rewards calibrated high confidence when a fracture is detected." }
      ],
      guidance: [
        "Ground-truth bounding boxes are from the FracAtlas dataset (CC BY 4.0) and were hidden until scoring.",
        "Localization mIoU is the primary metric — each ground-truth box is matched to the best predicted box.",
        "Keep box coordinates as percentages so results remain portable across image sizes.",
        "Review low-IoU cases visually to understand where the model missed fracture regions."
      ],
      errors
    };

    await saveAuditEvent("fracture.localization_benchmark", actor, {
      scored_cases: cases.length,
      overall_score: metrics.overall_score,
      localization_miou: metrics.localization_miou
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Fracture benchmark failed." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateVisionText } from "@/lib/llm";
import { saveAuditEvent } from "@/lib/storage";
import {
  calculateFractureMetrics,
  findTruth,
  FractureBenchmarkCase,
  FracturePrediction,
  inferDatasetHint,
  inferTruthFromPath,
  matchStatus,
  normalizeTruthLabel,
  parseGroundTruthCsv
} from "@/lib/fractureBenchmark";
import { Provider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function promptForFracture(fileName: string, datasetHint: string, benchmarkMode: string) {
  return `You are assisting with a research-only bone fracture detection benchmark for X-ray images.

Image file: ${fileName}
Dataset hint: ${datasetHint}
Benchmark mode: ${benchmarkMode || "general fracture detection"}

Return only a JSON object with this exact shape:
{
  "file_name": "${fileName}",
  "dataset_hint": "${datasetHint}",
  "body_region": "wrist|hand|forearm|elbow|humerus|shoulder|ankle|foot|knee|femur|hip|clavicle|rib|spine|pelvis|unknown",
  "predicted_label": "fracture|normal|unknown",
  "confidence": 0-100,
  "fracture_type": "short label or unknown",
  "laterality": "left|right|bilateral|unknown",
  "visible_findings": ["short visible radiographic findings"],
  "localization": "anatomic location if visible",
  "quality": "diagnostic|limited|non_xray",
  "rationale": "brief reasoning based on visible X-ray evidence",
  "recommendations": ["benchmark or review recommendation"],
  "warnings": ["limitations, uncertainty, or safety warnings"]
}

Decision rule:
- Mark "fracture" when there is visible cortical break, lucency, displaced fragment, buckle/torus deformity, avulsion fragment, or strong fracture-specific evidence.
- Mark "normal" when no fracture-specific evidence is visible.
- Mark "unknown" if the image is not a usable X-ray or the view is too limited.
- Do not invent patient identifiers. Do not give clinical clearance.`;
}

function parsePrediction(text: string, fileName: string, datasetHint: string): FracturePrediction {
  const jsonText = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);
  return {
    file_name: String(parsed.file_name || fileName),
    dataset_hint: String(parsed.dataset_hint || datasetHint),
    body_region: String(parsed.body_region || "unknown"),
    predicted_label: normalizeTruthLabel(parsed.predicted_label),
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    fracture_type: String(parsed.fracture_type || "unknown"),
    laterality: String(parsed.laterality || "unknown"),
    visible_findings: Array.isArray(parsed.visible_findings) ? parsed.visible_findings.map(String) : [],
    localization: String(parsed.localization || "unknown"),
    quality: ["diagnostic", "limited", "non_xray"].includes(parsed.quality) ? parsed.quality : "limited",
    rationale: String(parsed.rationale || ""),
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
  };
}

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before running a benchmark." }, { status: 401 });
    const form = await request.formData();
    const files = form.getAll("images").filter((item): item is File => item instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "Upload one or more X-ray images for fracture benchmarking." }, { status: 400 });
    }
    if (files.length > 40) {
      return NextResponse.json({ error: "Benchmark up to 40 images per run to keep the review responsive." }, { status: 400 });
    }

    const provider = (form.get("provider")?.toString() || process.env.DEFAULT_REPORT_PROVIDER || "openai") as Provider;
    const model = form.get("model")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const datasetMode = form.get("datasetMode")?.toString() || "mixed";
    const labelCsv = form.get("labelsCsv")?.toString() || "";
    const truths = parseGroundTruthCsv(labelCsv);

    const cases: FractureBenchmarkCase[] = [];
    const errors: string[] = [];

    for (const image of files) {
      if (image.type && !image.type.startsWith("image/")) {
        errors.push(`${image.name}: skipped because it is not an image file.`);
        continue;
      }

      try {
        const explicitTruth = findTruth(image.name, truths);
        const datasetHint = inferDatasetHint(image.name, explicitTruth?.dataset || datasetMode);
        const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
        const text = await generateVisionText({
          provider,
          model,
          apiKey,
          base64,
          mimeType: image.type || "image/png",
          prompt: promptForFracture(image.name, datasetHint, datasetMode),
          temperature: 0
        });
        const prediction = parsePrediction(text, image.name, datasetHint);
        const groundTruth = explicitTruth?.label || inferTruthFromPath(image.name);
        cases.push({
          ...prediction,
          ground_truth: groundTruth,
          expected_dataset: explicitTruth?.dataset || datasetHint,
          expected_body_region: explicitTruth?.body_region || prediction.body_region,
          match_status: matchStatus(prediction.predicted_label, groundTruth)
        });
      } catch (error: any) {
        errors.push(`${image.name}: ${error.message || "prediction failed"}`);
      }
    }

    const metrics = calculateFractureMetrics(cases);
    const datasets = Array.from(new Set(cases.map((item) => item.expected_dataset || item.dataset_hint || "Custom upload")));
    const dataset_breakdown = datasets.map((dataset) => ({
      dataset,
      metrics: calculateFractureMetrics(cases.filter((item) => (item.expected_dataset || item.dataset_hint || "Custom upload") === dataset))
    }));

    const payload = {
      summary: metrics.labeled
        ? `Evaluated ${metrics.labeled} labeled image(s): sensitivity ${metrics.sensitivity ?? "n/a"}%, specificity ${metrics.specificity ?? "n/a"}%, F1 ${metrics.f1 ?? "n/a"}%.`
        : `Evaluated ${cases.length} image(s). Add FracAtlas/MURA labels or use positive/negative folders to compute ground-truth metrics.`,
      metrics,
      cases,
      dataset_breakdown,
      guidance: [
        "Use FracAtlas labels for fracture localization and binary fracture-vs-normal evaluation.",
        "Use MURA positive/negative study folders or a CSV label file for upper-extremity abnormality benchmarking.",
        "Review false negatives first because missed fractures are the highest-risk benchmark failures.",
        "Keep a held-out split by patient/study, not by image, to avoid leakage."
      ],
      errors
    };
    await saveAuditEvent("fracture.benchmark", actor, {
      image_count: files.length,
      labeled: metrics.labeled,
      sensitivity: metrics.sensitivity,
      specificity: metrics.specificity,
      f1: metrics.f1
    });
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Fracture benchmark failed." }, { status: 500 });
  }
}

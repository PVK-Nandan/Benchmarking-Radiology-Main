import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createDicomMontage } from "@/lib/dicomMontage";
import { extractJsonObject } from "@/lib/json";
import { generateVisionText } from "@/lib/llm";
import { dicomFolderAbnormalityJsonPrompt } from "@/lib/reportPrompt";
import { saveAuditEvent } from "@/lib/storage";
import { Provider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DicomFolderReview = {
  summary: string;
  possible_abnormalities: string[];
  possible_errors: string[];
  critical_finding_screen: string;
  recommendations: string[];
  limitations: string[];
  boxes: Array<{
    label: string;
    confidence: "low" | "medium" | "high";
    tile: number;
    x: number;
    y: number;
    width: number;
    height: number;
    reason: string;
  }>;
};

function sampleFiles(files: File[], maxFiles: number) {
  if (files.length <= maxFiles) return files;
  const step = files.length / maxFiles;
  const sampled: File[] = [];
  for (let index = 0; index < maxFiles; index++) {
    sampled.push(files[Math.min(files.length - 1, Math.floor(index * step))]);
  }
  return sampled;
}

function clampBox(box: DicomFolderReview["boxes"][number], width: number, height: number) {
  const x = Math.max(0, Math.min(width, Number(box.x) || 0));
  const y = Math.max(0, Math.min(height, Number(box.y) || 0));
  const boxWidth = Math.max(1, Math.min(width - x, Number(box.width) || 1));
  const boxHeight = Math.max(1, Math.min(height - y, Number(box.height) || 1));
  return {
    ...box,
    confidence: ["low", "medium", "high"].includes(box.confidence) ? box.confidence : "low",
    x,
    y,
    width: boxWidth,
    height: boxHeight
  };
}

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before running analysis." }, { status: 401 });
    const form = await request.formData();
    const files = form.getAll("dicomFiles").filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) {
      return NextResponse.json({ error: "Upload a DICOM folder or DICOM files first." }, { status: 400 });
    }

    const provider = (form.get("provider")?.toString() || process.env.DEFAULT_REPORT_PROVIDER || "openai") as Provider;
    const model = form.get("model")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const totalSelected = Number(form.get("totalSelected")?.toString() || files.length) || files.length;
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        error: "OpenAI API key is required for AI abnormality detection. Add OPENAI_API_KEY in .env.local or paste a key in Judge Settings."
      }, { status: 400 });
    }

    const sampledFiles = sampleFiles(files, 48);
    const montage = await createDicomMontage(sampledFiles, 24);
    const raw = await generateVisionText({
      provider,
      model,
      apiKey,
      base64: montage.png.toString("base64"),
      mimeType: "image/png",
      prompt: dicomFolderAbnormalityJsonPrompt({
        filesReceived: totalSelected,
        filesRendered: montage.filesRendered,
        modality: montage.modality,
        studyDescription: montage.studyDescription,
        seriesDescription: montage.seriesDescription,
        windowCenter: montage.windowCenter,
        windowWidth: montage.windowWidth
      }),
      temperature: 0.1
    });

    const review = extractJsonObject<DicomFolderReview>(raw);
    review.boxes = (review.boxes || []).map((box) => clampBox(box, montage.width, montage.height));
    await saveAuditEvent("dicom.folder_scan", actor, {
      selected_files: totalSelected,
      uploaded_files: sampledFiles.length,
      boxes: review.boxes.length
    });

    return NextResponse.json({
      review,
      montage: `data:image/png;base64,${montage.png.toString("base64")}`,
      montageSize: { width: montage.width, height: montage.height },
      metadata: {
        filesReceived: files.length,
        filesSelectedInFolder: totalSelected,
        filesUploadedForScan: sampledFiles.length,
        filesRendered: montage.filesRendered,
        modality: montage.modality,
        studyDescription: montage.studyDescription,
        seriesDescription: montage.seriesDescription,
        windowCenter: montage.windowCenter,
        windowWidth: montage.windowWidth,
        tiles: montage.tiles
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "DICOM folder AI scan failed." }, { status: 500 });
  }
}

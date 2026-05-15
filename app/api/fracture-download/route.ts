import { NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import path from "path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGES = [
  "fracatlas_01_IMG0000019.jpg",
  "fracatlas_02_IMG0000025.jpg",
  "fracatlas_03_IMG0000261.jpg",
  "fracatlas_04_IMG0000307.jpg",
  "fracatlas_05_finger.jpg",
  "fracatlas_06_forearm.jpg",
  "fracatlas_07_shoulder.jpg",
  "fracatlas_08_wrist.jpg",
  "fracatlas_09_IMG0002302.jpg",
  "fracatlas_10_IMG0002620.jpg"
];

export async function GET() {
  const zip = new JSZip();
  const folder = zip.folder("fracture-benchmark-images")!;
  let added = 0;

  for (const fileName of IMAGES) {
    const filePath = path.join(process.cwd(), "public", "fracture-samples", fileName);
    try {
      await access(filePath);
      const buffer = await readFile(filePath);
      folder.file(fileName, buffer);
      added++;
    } catch {
      // skip missing files
    }
  }

  if (added === 0) {
    return NextResponse.json({ error: "No image files found." }, { status: 404 });
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });

  return new Response(zipBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="fracture-benchmark-images.zip"`,
      "Content-Length": String((zipBuffer as ArrayBuffer).byteLength)
    }
  });
}

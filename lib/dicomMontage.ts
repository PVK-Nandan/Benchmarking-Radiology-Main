import * as dicomParser from "dicom-parser";
import sharp from "sharp";

export type DicomMontageTile = {
  tileIndex: number;
  fileName: string;
  instanceNumber: number | null;
  sliceLocation: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DicomMontage = {
  png: Buffer;
  width: number;
  height: number;
  filesReceived: number;
  filesRendered: number;
  modality: string;
  studyDescription: string;
  seriesDescription: string;
  windowCenter: number;
  windowWidth: number;
  tiles: DicomMontageTile[];
};

type DicomImage = {
  fileName: string;
  instanceNumber: number | null;
  sliceLocation: number | null;
  rows: number;
  columns: number;
  modality: string;
  studyDescription: string;
  seriesDescription: string;
  photometric: string;
  windowCenter: number | null;
  windowWidth: number | null;
  pixels: Int16Array | Uint16Array | Uint8Array;
  pixelRepresentation: number;
  rescaleSlope: number;
  rescaleIntercept: number;
};

function readString(dataSet: dicomParser.DataSet, tag: string) {
  return dataSet.string(tag)?.trim() || "";
}

function readNumber(dataSet: dicomParser.DataSet, tag: string) {
  const value = readString(dataSet, tag).split("\\")[0];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readUint16(dataSet: dicomParser.DataSet, tag: string) {
  try {
    return dataSet.uint16(tag);
  } catch {
    const parsed = Number(readString(dataSet, tag));
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

function parseDicomImage(fileName: string, bytes: Uint8Array): DicomImage {
  const dataSet = dicomParser.parseDicom(bytes);
  const transferSyntax = readString(dataSet, "x00020010");
  if (transferSyntax && !["1.2.840.10008.1.2", "1.2.840.10008.1.2.1"].includes(transferSyntax)) {
    throw new Error(`Unsupported compressed or non-little-endian DICOM transfer syntax: ${transferSyntax}`);
  }

  const rows = readUint16(dataSet, "x00280010");
  const columns = readUint16(dataSet, "x00280011");
  const bitsAllocated = readUint16(dataSet, "x00280100");
  const samplesPerPixel = readUint16(dataSet, "x00280002") || 1;
  const pixelRepresentation = readUint16(dataSet, "x00280103");
  const pixelElement = dataSet.elements.x7fe00010;
  if (!rows || !columns || !pixelElement) {
    throw new Error("DICOM file does not contain readable pixel data.");
  }
  if (samplesPerPixel !== 1) {
    throw new Error("Only single-channel grayscale DICOM images are supported in this AI scan.");
  }

  const start = bytes.byteOffset + pixelElement.dataOffset;
  const end = start + pixelElement.length;
  const pixelBuffer = bytes.buffer.slice(start, end);
  let pixels: DicomImage["pixels"];
  if (bitsAllocated === 16) {
    pixels = pixelRepresentation === 1 ? new Int16Array(pixelBuffer) : new Uint16Array(pixelBuffer);
  } else if (bitsAllocated === 8) {
    pixels = new Uint8Array(pixelBuffer);
  } else {
    throw new Error(`Unsupported DICOM bit depth: ${bitsAllocated}`);
  }

  return {
    fileName,
    instanceNumber: readNumber(dataSet, "x00200013"),
    sliceLocation: readNumber(dataSet, "x00201041"),
    rows,
    columns,
    modality: readString(dataSet, "x00080060") || "Unknown",
    studyDescription: readString(dataSet, "x00081030") || "Not provided",
    seriesDescription: readString(dataSet, "x0008103e") || "Not provided",
    photometric: readString(dataSet, "x00280004") || "MONOCHROME2",
    windowCenter: readNumber(dataSet, "x00281050"),
    windowWidth: readNumber(dataSet, "x00281051"),
    pixels,
    pixelRepresentation,
    rescaleSlope: readNumber(dataSet, "x00281053") ?? 1,
    rescaleIntercept: readNumber(dataSet, "x00281052") ?? 0
  };
}

function chooseWindow(images: DicomImage[]) {
  const first = images[0];
  const text = `${first.studyDescription} ${first.seriesDescription}`.toLowerCase();
  if (first.modality.toUpperCase() === "CT" && /chest|lung|hrct|thorax/.test(text)) {
    return { center: -600, width: 1500 };
  }
  return {
    center: first.windowCenter ?? 40,
    width: first.windowWidth ?? 400
  };
}

function windowPixels(image: DicomImage, center: number, width: number) {
  const output = new Uint8Array(image.rows * image.columns);
  const low = center - width / 2;
  const safeWidth = Math.max(width, 1);

  for (let index = 0; index < output.length; index++) {
    const hu = Number(image.pixels[index]) * image.rescaleSlope + image.rescaleIntercept;
    let value = Math.round(((hu - low) / safeWidth) * 255);
    value = Math.max(0, Math.min(255, value));
    output[index] = image.photometric === "MONOCHROME1" ? 255 - value : value;
  }
  return output;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function createDicomMontage(files: File[], maxTiles = 24): Promise<DicomMontage> {
  if (!files.length) {
    throw new Error("Upload a DICOM folder or DICOM files first.");
  }

  const parsed: DicomImage[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      parsed.push(parseDicomImage(file.name, bytes));
    } catch (error: any) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }

  if (!parsed.length) {
    throw new Error(errors[0] || "No readable DICOM images were found.");
  }

  parsed.sort((left, right) => {
    const leftKey = left.instanceNumber ?? left.sliceLocation ?? 0;
    const rightKey = right.instanceNumber ?? right.sliceLocation ?? 0;
    return leftKey - rightKey;
  });

  const step = Math.max(1, Math.floor(parsed.length / maxTiles));
  const selected = parsed.filter((_, index) => index % step === 0).slice(0, maxTiles);
  const { center, width } = chooseWindow(selected);
  const tileSize = 192;
  const labelHeight = 28;
  const gap = 8;
  const columns = Math.min(6, selected.length);
  const rows = Math.ceil(selected.length / columns);
  const montageWidth = columns * tileSize + (columns + 1) * gap;
  const montageHeight = rows * (tileSize + labelHeight) + (rows + 1) * gap;
  const composites: sharp.OverlayOptions[] = [];
  const tiles: DicomMontageTile[] = [];

  for (const [index, image] of selected.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (tileSize + gap);
    const y = gap + row * (tileSize + labelHeight + gap);
    const pixels = windowPixels(image, center, width);
    const tile = await sharp(Buffer.from(pixels), {
      raw: { width: image.columns, height: image.rows, channels: 1 }
    })
      .resize(tileSize, tileSize, { fit: "contain", background: { r: 0, g: 0, b: 0 } })
      .png()
      .toBuffer();

    const label = `Tile ${index + 1} | ${image.fileName} | Inst ${image.instanceNumber ?? "?"}`;
    const svg = Buffer.from(`<svg width="${tileSize}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#07111f"/>
      <text x="6" y="18" fill="#d8e7f7" font-family="Arial, sans-serif" font-size="12">${escapeXml(label)}</text>
    </svg>`);

    composites.push({ input: tile, left: x, top: y });
    composites.push({ input: svg, left: x, top: y + tileSize });
    tiles.push({
      tileIndex: index + 1,
      fileName: image.fileName,
      instanceNumber: image.instanceNumber,
      sliceLocation: image.sliceLocation,
      x,
      y,
      width: tileSize,
      height: tileSize
    });
  }

  const header = Buffer.from(`<svg width="${montageWidth}" height="${montageHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#050b12"/>
  </svg>`);
  const png = await sharp(header).composite(composites).png().toBuffer();
  const first = selected[0];

  return {
    png,
    width: montageWidth,
    height: montageHeight,
    filesReceived: files.length,
    filesRendered: selected.length,
    modality: first.modality,
    studyDescription: first.studyDescription,
    seriesDescription: first.seriesDescription,
    windowCenter: center,
    windowWidth: width,
    tiles
  };
}

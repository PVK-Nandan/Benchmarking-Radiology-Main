export type FractureBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FractureGroundTruthCase = {
  file_name: string;
  mura_region: string;
  fracture: string;
  fracture_type: string;
  fracture_count: number;
  boxes: FractureBox[];
  notes?: string;
};

export type FracturePrediction = {
  file_name: string;
  mura_region: string;
  predicted_fracture: string;
  predicted_fracture_type: string;
  predicted_fracture_count: number;
  boxes: FractureBox[];
  confidence: number;
  visible_findings: string[];
  rationale: string;
  warnings: string[];
};

export type FractureBenchmarkCase = {
  file_name: string;
  ground_truth: FractureGroundTruthCase;
  prediction: FracturePrediction;
  scores: {
    best_iou: number;
    mean_iou: number;
    localization_score: number;
    type_score: number;
    count_score: number;
    detection_score: number;
    confidence_score: number;
    case_score: number;
  };
};

export type FractureBenchmarkMetrics = {
  total: number;
  localization_miou: number;
  localization_score: number;
  fracture_type_accuracy: number;
  fracture_count_accuracy: number;
  detection_accuracy: number;
  confidence_alignment: number;
  overall_score: number;
};

export type FractureBenchmarkResult = {
  summary: string;
  metrics: FractureBenchmarkMetrics;
  cases: FractureBenchmarkCase[];
  scoring: Array<{
    metric: string;
    weight: number;
    description: string;
  }>;
  guidance: string[];
  errors: string[];
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "") || "";
}

export function parseFractureCaseJson(text: string): FractureGroundTruthCase[] {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.cases;
  if (!Array.isArray(rows)) throw new Error("Ground-truth JSON must be an array or an object with a cases array.");

  return rows.map((row: any) => ({
    file_name: String(row.file_name || ""),
    mura_region: String(row.mura_region || row.body_region || "unknown"),
    fracture: String(row.fracture || row.label || "fracture"),
    fracture_type: String(row.fracture_type || "unknown"),
    fracture_count: Math.max(0, Number(row.fracture_count ?? row.number_of_fractures ?? row.count ?? 1) || 0),
    boxes: normalizeBoxes(row.boxes || row.bounding_boxes || []),
    notes: row.notes ? String(row.notes) : undefined
  })).filter((row) => row.file_name);
}

export function findFractureCase(fileName: string, cases: FractureGroundTruthCase[]) {
  const key = cleanKey(fileName);
  return cases.find((item) => cleanKey(item.file_name) === key || cleanKey(item.file_name) === cleanKey(fileName.split("/").pop() || fileName));
}

export function normalizeBoxes(value: any): FractureBox[] {
  if (!Array.isArray(value)) return [];
  return value.map((box) => ({
    x: clampPercent(Number(box.x)),
    y: clampPercent(Number(box.y)),
    width: clampPercent(Number(box.width)),
    height: clampPercent(Number(box.height))
  })).filter((box) => box.width > 0 && box.height > 0);
}

export function boxIou(left: FractureBox, right: FractureBox) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union ? intersection / union : 0;
}

function bestIouForBox(box: FractureBox, predictions: FractureBox[]) {
  return predictions.reduce((best, prediction) => Math.max(best, boxIou(box, prediction)), 0);
}

function roundedPercent(value: number) {
  return Math.round(value * 1000) / 10;
}

export function scoreFractureCase(groundTruth: FractureGroundTruthCase, prediction: FracturePrediction): FractureBenchmarkCase["scores"] {
  const expectedBoxes = groundTruth.boxes;
  const predictedBoxes = prediction.boxes;
  const perBoxIou = expectedBoxes.map((box) => bestIouForBox(box, predictedBoxes));
  const meanIou = perBoxIou.length ? perBoxIou.reduce((sum, value) => sum + value, 0) / perBoxIou.length : 0;
  const bestIou = perBoxIou.length ? Math.max(...perBoxIou) : 0;
  const localizationScore = roundedPercent(meanIou);
  const expectedType = cleanText(groundTruth.fracture_type);
  const predictedType = cleanText(prediction.predicted_fracture_type);
  const typeScore = expectedType && predictedType && (expectedType === predictedType || expectedType.includes(predictedType) || predictedType.includes(expectedType)) ? 100 : 0;
  const countDifference = Math.abs(groundTruth.fracture_count - prediction.predicted_fracture_count);
  const countScore = groundTruth.fracture_count === 0
    ? (prediction.predicted_fracture_count === 0 ? 100 : 0)
    : Math.max(0, 100 - (countDifference / Math.max(groundTruth.fracture_count, 1)) * 100);
  const detectionScore = prediction.predicted_fracture.toLowerCase().includes("fracture") ? 100 : 0;
  const confidenceScore = detectionScore ? prediction.confidence : 100 - prediction.confidence;
  const caseScore = Math.round(
    localizationScore * 0.45 +
    typeScore * 0.2 +
    countScore * 0.15 +
    detectionScore * 0.15 +
    confidenceScore * 0.05
  );

  return {
    best_iou: roundedPercent(bestIou),
    mean_iou: localizationScore,
    localization_score: localizationScore,
    type_score: typeScore,
    count_score: Math.round(countScore),
    detection_score: detectionScore,
    confidence_score: Math.round(confidenceScore),
    case_score: caseScore
  };
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
}

export function calculateFractureMetrics(cases: FractureBenchmarkCase[]): FractureBenchmarkMetrics {
  return {
    total: cases.length,
    localization_miou: average(cases.map((item) => item.scores.mean_iou)),
    localization_score: average(cases.map((item) => item.scores.localization_score)),
    fracture_type_accuracy: average(cases.map((item) => item.scores.type_score)),
    fracture_count_accuracy: average(cases.map((item) => item.scores.count_score)),
    detection_accuracy: average(cases.map((item) => item.scores.detection_score)),
    confidence_alignment: average(cases.map((item) => item.scores.confidence_score)),
    overall_score: average(cases.map((item) => item.scores.case_score))
  };
}

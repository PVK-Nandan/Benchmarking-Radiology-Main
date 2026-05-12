export type FractureTruthLabel = "fracture" | "normal" | "unknown";

export type FracturePrediction = {
  file_name: string;
  dataset_hint: string;
  body_region: string;
  predicted_label: FractureTruthLabel;
  confidence: number;
  fracture_type: string;
  laterality: string;
  visible_findings: string[];
  localization: string;
  quality: "diagnostic" | "limited" | "non_xray";
  rationale: string;
  recommendations: string[];
  warnings: string[];
};

export type FractureGroundTruth = {
  file_name: string;
  label: FractureTruthLabel;
  dataset?: string;
  body_region?: string;
  fracture_type?: string;
};

export type FractureBenchmarkCase = FracturePrediction & {
  ground_truth: FractureTruthLabel;
  expected_dataset: string;
  expected_body_region: string;
  match_status: "tp" | "tn" | "fp" | "fn" | "unlabeled";
};

export type FractureBenchmarkMetrics = {
  total: number;
  labeled: number;
  unlabeled: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  sensitivity: number | null;
  specificity: number | null;
  precision: number | null;
  f1: number | null;
  false_negative_rate: number | null;
  false_positive_rate: number | null;
};

export type FractureBenchmarkResult = {
  summary: string;
  metrics: FractureBenchmarkMetrics;
  cases: FractureBenchmarkCase[];
  dataset_breakdown: Array<{
    dataset: string;
    metrics: FractureBenchmarkMetrics;
  }>;
  guidance: string[];
};

function cleanKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "") || "";
}

export function normalizeTruthLabel(value?: string): FractureTruthLabel {
  const text = (value || "").toLowerCase().trim();
  if (!text) return "unknown";
  if (["1", "true", "yes", "positive", "abnormal", "fracture", "fractured", "fx"].includes(text)) return "fracture";
  if (["0", "false", "no", "negative", "normal", "no fracture", "nofracture"].includes(text)) return "normal";
  if (text.includes("fracture") && !text.includes("no fracture")) return "fracture";
  if (text.includes("normal") || text.includes("negative")) return "normal";
  return "unknown";
}

export function inferDatasetHint(fileName: string, explicit?: string) {
  const text = `${explicit || ""} ${fileName}`.toLowerCase();
  if (text.includes("fracatlas")) return "FracAtlas";
  if (text.includes("mura")) return "MURA";
  return "Custom upload";
}

export function inferTruthFromPath(fileName: string): FractureTruthLabel {
  const text = fileName.toLowerCase().replace(/\\/g, "/");
  if (/(^|\/)(positive|fracture|fractured|abnormal|fx)(\/|_|-)/.test(text)) return "fracture";
  if (/(^|\/)(negative|normal|no_fracture|nofracture)(\/|_|-)/.test(text)) return "normal";
  if (text.includes("positive")) return "fracture";
  if (text.includes("negative") || text.includes("normal")) return "normal";
  return "unknown";
}

export function parseGroundTruthCsv(csv: string): FractureGroundTruth[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.some((cell) => ["filename", "file", "image", "path", "label", "fracture"].includes(cell));
  const rows = hasHeader ? lines.slice(1) : lines;
  const names = hasHeader ? header : ["filename", "label", "dataset", "body_region", "fracture_type"];

  function value(cells: string[], aliases: string[]) {
    const index = names.findIndex((name) => aliases.includes(name));
    return index >= 0 ? cells[index]?.trim() || "" : "";
  }

  return rows.map((row) => {
    const cells = row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const fileName = value(cells, ["filename", "file", "image", "path", "name"]) || cells[0] || "";
    const labelValue = value(cells, ["label", "fracture", "class", "target", "positive"]) || cells[1] || "";
    return {
      file_name: fileName,
      label: normalizeTruthLabel(labelValue),
      dataset: value(cells, ["dataset", "source"]),
      body_region: value(cells, ["body_region", "region", "study_type", "anatomy"]),
      fracture_type: value(cells, ["fracture_type", "type"])
    };
  }).filter((item) => item.file_name);
}

export function findTruth(fileName: string, truths: FractureGroundTruth[]) {
  const key = cleanKey(fileName);
  return truths.find((truth) => cleanKey(truth.file_name) === key || cleanKey(truth.file_name) === cleanKey(fileName.split("/").pop() || fileName));
}

function divide(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function calculateFractureMetrics(cases: FractureBenchmarkCase[]): FractureBenchmarkMetrics {
  const labeledCases = cases.filter((item) => item.ground_truth !== "unknown");
  const tp = labeledCases.filter((item) => item.match_status === "tp").length;
  const tn = labeledCases.filter((item) => item.match_status === "tn").length;
  const fp = labeledCases.filter((item) => item.match_status === "fp").length;
  const fn = labeledCases.filter((item) => item.match_status === "fn").length;
  return {
    total: cases.length,
    labeled: labeledCases.length,
    unlabeled: cases.length - labeledCases.length,
    tp,
    tn,
    fp,
    fn,
    accuracy: divide(tp + tn, labeledCases.length),
    sensitivity: divide(tp, tp + fn),
    specificity: divide(tn, tn + fp),
    precision: divide(tp, tp + fp),
    f1: tp ? Math.round(((2 * tp) / (2 * tp + fp + fn)) * 1000) / 10 : (labeledCases.length ? 0 : null),
    false_negative_rate: divide(fn, tp + fn),
    false_positive_rate: divide(fp, tn + fp)
  };
}

export function matchStatus(prediction: FractureTruthLabel, truth: FractureTruthLabel): FractureBenchmarkCase["match_status"] {
  if (truth === "unknown" || prediction === "unknown") return "unlabeled";
  if (prediction === "fracture" && truth === "fracture") return "tp";
  if (prediction === "normal" && truth === "normal") return "tn";
  if (prediction === "fracture" && truth === "normal") return "fp";
  return "fn";
}

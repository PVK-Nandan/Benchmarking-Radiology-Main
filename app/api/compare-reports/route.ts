import { NextResponse } from "next/server";
import { fileToText } from "@/lib/fileText";
import { getCurrentUser } from "@/lib/auth";
import { extractJsonObject } from "@/lib/json";
import { generateText } from "@/lib/llm";
import { saveAuditEvent, saveReportTest } from "@/lib/storage";
import { Provider, ReportComparison } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const system = "You are a severe radiology AI benchmarking judge for hospital-readiness testing. Return valid JSON only. Do not provide medical advice.";

function comparisonPrompt(modelReport: string, referenceReport: string) {
  return `Compare the submitted model radiology report against the AI reference report.

This is a STRICT hospital-readiness benchmark. Do not give high scores for reports that merely sound clinically polished. A report is only good if it communicates the same clinical meaning: same exam, same anatomy/body region, same laterality when relevant, same normal/abnormal status, same primary disease/condition, and same clinically important findings.

Global semantic matching rules:
- All scoring, pass/fail decisions, strict_mismatch booleans, disease_prediction status, key_differences, missing_findings, unsupported_claims, and section_diff must be based on clinical semantic meaning, not exact word overlap.
- Equivalent lay terms, radiology terms, synonyms, abbreviations, paraphrases, and more-specific or less-specific wording should count as matches when they communicate the same clinically relevant idea.
- Do not require the same words, phrase order, grammar, report style, or section wording. Penalize only differences that change clinical meaning, safety, diagnosis, anatomy, laterality, severity, acuity, modality, or management.
- Do not penalize a report for using a precise radiology phrase instead of a simple phrase. Examples include, but are not limited to: "fracture in wrist", "wrist fracture", "distal radius fracture", "distal radial cortical disruption", and "cortical break of the distal radius" when laterality and context are aligned.
- A broader region and a precise sub-region can match if clinically consistent. Examples include, but are not limited to: wrist with distal radius, shoulder with proximal humerus/glenohumeral joint, chest with lungs/pleura, abdomen with bowel/liver/kidney, when the reported finding is the same.
- Match disease concepts across wording. Examples include, but are not limited to: "broken bone" = "fracture"; "fluid around the lung" = "pleural effusion"; "collapsed lung" = "pneumothorax"; "heart enlargement" = "cardiomegaly"; "infection in lung" = "pneumonia/consolidation" when context supports it.
- Mark same_primary_diagnosis true when the diagnosis is semantically equivalent, even if one report is more technical, more concise, more detailed, or uses a different clinical synonym.
- Mark a finding as missing only if the submitted report fails to communicate the same clinical idea at any specificity level.
- Mark unsupported/hallucinated only when the submitted report adds a clinically different finding, not merely when it uses a different synonym, wording style, or level of detail.
- Still penalize true clinical mismatches. Example: distal radius fracture is not the same as scaphoid fracture unless both injuries are present; sprain/soft tissue swelling alone is not the same as fracture; left and right are not interchangeable.

Judge:
- same exam type/modality/view when stated
- same body region and laterality when stated
- same primary diagnosis or disease case
- same normal vs abnormal conclusion
- same clinically important findings and negatives
- missed critical findings
- unsupported/hallucinated findings
- safety and recommendations
- completeness and clinical language

Hard scoring rules:
- If model and reference describe different body regions or different exam types, overall_score must be 0-25.
- If the primary disease/diagnosis is incorrect, overall_score must be 0-35.
- If one report says normal/no acute abnormality and the other has a real abnormal diagnosis, overall_score must be 0-40.
- If a critical finding is missed, overall_score must be 0-50, and safety_score must be <=50.
- If the model invents a major unsupported diagnosis, hallucination_control must be <=40 and overall_score must be <=45.
- If the model is only partially correct, overall_score should usually be 45-70, not above 75.
- Scores above 85 are allowed only when the same disease, findings, impression, and recommendations are closely aligned.

Scores must be integers 0-100. negative_marking starts at 100 and drops sharply for critical misses, unsafe advice, false diagnosis, hallucinated findings, wrong anatomy, wrong modality, or false reassurance.

Return exactly this JSON shape:
{
  "overall_score": 0,
  "pass": false,
  "judge_summary": "",
  "strict_mismatch": {
    "same_exam_type": false,
    "same_body_region": false,
    "same_laterality": false,
    "same_primary_diagnosis": false,
    "normal_vs_abnormal_match": false,
    "critical_finding_missed": false,
    "major_unsupported_diagnosis": false,
    "explanation": ""
  },
  "disease_prediction": {
    "model_diagnosis": "",
    "reference_diagnosis": "",
    "status": "correct",
    "explanation": ""
  },
  "metric_scores": {
    "findings_match": 0,
    "impression_accuracy": 0,
    "recommendation_alignment": 0,
    "safety_score": 0,
    "completeness": 0,
    "clinical_language": 0,
    "hallucination_control": 0,
    "negative_marking": 0
  },
  "key_differences": [],
  "missing_findings": [],
  "unsupported_claims": [],
  "section_diff": {
    "clinical_information": { "model": "", "reference": "" },
    "technique": { "model": "", "reference": "" },
    "findings": { "model": "", "reference": "" },
    "impressions": { "model": "", "reference": "" },
    "recommendations": { "model": "", "reference": "" }
  }
}

Allowed disease_prediction.status values: correct, partially_correct, incorrect, not_applicable.
For strict_mismatch booleans, use true only when the reports genuinely match or the field is not applicable. If uncertain, mark false and explain.

SUBMITTED MODEL REPORT:
${modelReport}

REFERENCE REPORT:
${referenceReport}`;
}

function clamp(value: number, max: number) {
  return Math.min(Number.isFinite(value) ? value : 0, max);
}

function normalizeComparison(result: ReportComparison): ReportComparison {
  const mismatch = result.strict_mismatch || {
    same_exam_type: true,
    same_body_region: true,
    same_laterality: true,
    same_primary_diagnosis: result.disease_prediction?.status === "correct",
    normal_vs_abnormal_match: true,
    critical_finding_missed: false,
    major_unsupported_diagnosis: false,
    explanation: "Strict mismatch fields were not returned by the judge."
  };

  let cap = 100;
  const reasons: string[] = [];

  if (!mismatch.same_exam_type || !mismatch.same_body_region) {
    cap = Math.min(cap, 25);
    reasons.push("different exam type or body region");
  }
  if (!mismatch.same_laterality) {
    cap = Math.min(cap, 55);
    reasons.push("laterality mismatch");
  }
  if (result.disease_prediction?.status === "incorrect" || !mismatch.same_primary_diagnosis) {
    cap = Math.min(cap, 35);
    reasons.push("primary diagnosis mismatch");
  }
  if (!mismatch.normal_vs_abnormal_match) {
    cap = Math.min(cap, 40);
    reasons.push("normal-vs-abnormal mismatch");
  }
  if (mismatch.critical_finding_missed) {
    cap = Math.min(cap, 50);
    reasons.push("critical finding missed");
    result.metric_scores.safety_score = clamp(result.metric_scores.safety_score, 50);
    result.metric_scores.negative_marking = clamp(result.metric_scores.negative_marking, 50);
  }
  if (mismatch.major_unsupported_diagnosis) {
    cap = Math.min(cap, 45);
    reasons.push("major unsupported diagnosis");
    result.metric_scores.hallucination_control = clamp(result.metric_scores.hallucination_control, 40);
    result.metric_scores.negative_marking = clamp(result.metric_scores.negative_marking, 55);
  }
  if (result.disease_prediction?.status === "partially_correct") {
    cap = Math.min(cap, 70);
    reasons.push("only partially correct diagnosis");
  }

  result.overall_score = clamp(result.overall_score, cap);
  if (cap < 100) {
    result.metric_scores.findings_match = clamp(result.metric_scores.findings_match, cap);
    result.metric_scores.impression_accuracy = clamp(result.metric_scores.impression_accuracy, cap);
    result.pass = false;
    const note = ` Strict cap applied: maximum ${cap}/100 due to ${reasons.join(", ")}.`;
    if (!result.judge_summary.includes("Strict cap applied")) {
      result.judge_summary = `${result.judge_summary}${note}`;
    }
  } else {
    result.pass = result.overall_score >= 80;
  }

  result.strict_mismatch = mismatch;
  return result;
}

export async function POST(request: Request) {
  try {
    const actor = getCurrentUser(request);
    if (!actor) return NextResponse.json({ error: "Login required before running a benchmark." }, { status: 401 });
    const form = await request.formData();
    const provider: Provider = "openai";
    const model = process.env.OPENAI_JUDGE_MODEL || "gpt-4.1-mini";
    const reportModel = form.get("reportModel")?.toString() || undefined;
    const apiKey = form.get("apiKey")?.toString() || undefined;
    const referenceReport = form.get("referenceReport")?.toString() || "";
    let modelReport = form.get("modelReport")?.toString() || "";
    const reportFile = form.get("reportFile");
    const image = form.get("image");
    if (reportFile instanceof File && reportFile.size > 0) {
      modelReport = await fileToText(reportFile);
    }
    if (!referenceReport.trim() || !modelReport.trim()) {
      return NextResponse.json({ error: "Both reference report and submitted model report are required." }, { status: 400 });
    }
    const raw = await generateText({
      provider,
      model,
      apiKey,
      system,
      prompt: comparisonPrompt(modelReport, referenceReport),
      responseJson: true
    });
    const result = normalizeComparison(extractJsonObject<ReportComparison>(raw));
    const storedTest = await saveReportTest({
      provider,
      judgeModel: model,
      reportModel,
      image: image instanceof File ? image : null,
      modelReport,
      referenceReport,
      comparison: result,
      actor
    });
    await saveAuditEvent("report.compare", actor, {
      image: image instanceof File ? image.name : null,
      score: result.overall_score,
      pass: result.pass
    });
    return NextResponse.json({ result, modelReport, storedTest });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Report comparison failed." }, { status: 500 });
  }
}

export type Provider = "openai";

export type ReportComparison = {
  overall_score: number;
  pass: boolean;
  judge_summary: string;
  strict_mismatch: {
    same_exam_type: boolean;
    same_body_region: boolean;
    same_laterality: boolean;
    same_primary_diagnosis: boolean;
    normal_vs_abnormal_match: boolean;
    critical_finding_missed: boolean;
    major_unsupported_diagnosis: boolean;
    explanation: string;
  };
  disease_prediction: {
    model_diagnosis: string;
    reference_diagnosis: string;
    status: "correct" | "partially_correct" | "incorrect" | "not_applicable";
    explanation: string;
  };
  metric_scores: {
    findings_match: number;
    impression_accuracy: number;
    recommendation_alignment: number;
    safety_score: number;
    completeness: number;
    clinical_language: number;
    hallucination_control: number;
    negative_marking: number;
  };
  key_differences: string[];
  missing_findings: string[];
  unsupported_claims: string[];
  section_diff: {
    clinical_information: { model: string; reference: string };
    technique: { model: string; reference: string };
    findings: { model: string; reference: string };
    impressions: { model: string; reference: string };
    recommendations: { model: string; reference: string };
  };
};

export type StoredReportTest = {
  id: string;
  created_at: string;
  provider: string;
  judge_model?: string;
  report_model?: string;
  image_name?: string;
  image_type?: string;
  image_url?: string;
  image_path?: string;
  model_report: string;
  reference_report: string;
  comparison: ReportComparison;
  overall_score: number;
  pass: boolean;
  model_diagnosis?: string;
  reference_diagnosis?: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
};

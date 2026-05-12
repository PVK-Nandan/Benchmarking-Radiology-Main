import { createClient } from "@supabase/supabase-js";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { AuthUser } from "./auth";
import { ReportComparison } from "./types";

export type StoredTest = {
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

type SaveTestInput = {
  provider: string;
  judgeModel?: string;
  reportModel?: string;
  image?: File | null;
  modelReport: string;
  referenceReport: string;
  comparison: ReportComparison;
  actor?: AuthUser | null;
};

export type AuditEvent = {
  id: string;
  created_at: string;
  action: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  details?: Record<string, unknown>;
};

const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(dataDir, "uploads");
const localDbPath = path.join(dataDir, "report-tests.jsonl");
const localAuditPath = path.join(dataDir, "audit-events.jsonl");

function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

function supabase() {
  return createClient(process.env.SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false }
  });
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140);
}

async function saveImageLocal(id: string, image?: File | null) {
  if (!image || image.size === 0) return {};
  await mkdir(uploadsDir, { recursive: true });
  const extension = path.extname(image.name) || ".bin";
  const fileName = `${id}-${safeName(image.name || `scan${extension}`)}`;
  const imagePath = path.join(uploadsDir, fileName);
  await writeFile(imagePath, Buffer.from(await image.arrayBuffer()));
  return {
    image_name: image.name,
    image_type: image.type,
    image_path: imagePath
  };
}

async function saveImageSupabase(id: string, image?: File | null) {
  if (!image || image.size === 0) return {};
  const bucket = process.env.SUPABASE_BUCKET || "monarcs-report-tests";
  const client = supabase();
  const fileName = `${id}/${safeName(image.name || "scan.bin")}`;
  const buffer = Buffer.from(await image.arrayBuffer());
  const upload = await client.storage.from(bucket).upload(fileName, buffer, {
    contentType: image.type || "application/octet-stream",
    upsert: true
  });
  if (upload.error) throw new Error(`Supabase image upload failed: ${upload.error.message}`);
  const { data } = client.storage.from(bucket).getPublicUrl(fileName);
  return {
    image_name: image.name,
    image_type: image.type,
    image_path: fileName,
    image_url: data.publicUrl
  };
}

export async function saveReportTest(input: SaveTestInput): Promise<StoredTest> {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const imageData = hasSupabase() ? await saveImageSupabase(id, input.image) : await saveImageLocal(id, input.image);
  const record: StoredTest = {
    id,
    created_at,
    provider: input.provider,
    judge_model: input.judgeModel,
    report_model: input.reportModel,
    ...imageData,
    model_report: input.modelReport,
    reference_report: input.referenceReport,
    comparison: input.comparison,
    overall_score: input.comparison.overall_score,
    pass: input.comparison.pass,
    model_diagnosis: input.comparison.disease_prediction?.model_diagnosis,
    reference_diagnosis: input.comparison.disease_prediction?.reference_diagnosis
  };
  if (input.actor) {
    record.actor_id = input.actor.id;
    record.actor_name = input.actor.name;
    record.actor_email = input.actor.email;
  }

  if (hasSupabase()) {
    const { error } = await supabase().from("monarcs_report_tests").insert(record);
    if (error) throw new Error(`Supabase test save failed: ${error.message}`);
  } else {
    await mkdir(dataDir, { recursive: true });
    await appendFile(localDbPath, `${JSON.stringify(record)}\n`, "utf-8");
  }

  return record;
}

export async function saveAuditEvent(action: string, actor?: AuthUser | null, details?: Record<string, unknown>) {
  const record: AuditEvent = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    action,
    actor_id: actor?.id,
    actor_name: actor?.name,
    actor_email: actor?.email,
    details
  };

  await mkdir(dataDir, { recursive: true });
  await appendFile(localAuditPath, `${JSON.stringify(record)}\n`, "utf-8");
  return record;
}

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  try {
    const text = await readFile(localAuditPath, "utf-8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEvent)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function listReportTests(limit = 50): Promise<StoredTest[]> {
  if (hasSupabase()) {
    const { data, error } = await supabase()
      .from("monarcs_report_tests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase test list failed: ${error.message}`);
    return (data || []) as StoredTest[];
  }

  try {
    const text = await readFile(localDbPath, "utf-8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredTest)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  } catch {
    return [];
  }
}

# MONARCS Radiology Report Comparison

A Vercel-ready app for benchmarking a radiology AI model by comparing its generated report against an AI reference report created from the same uploaded image.

## What This App Does

1. Upload the scan image used by the tested model.
2. Generate an AI reference report from that image with OpenAI.
3. Upload or paste the tested model's report as PDF/TXT/text.
4. Compare both reports with an LLM judge that matches clinical meaning, not just exact words.
5. Receive scores for:
   - Findings match
   - Impression accuracy
   - Recommendation alignment
   - Safety
   - Completeness
   - Clinical language
   - Hallucination control
   - Negative marking

The result also includes diagnosis correctness, key differences, missing findings, unsupported claims, and section-by-section comparison.

The judge is prompted to treat semantically equivalent clinical wording as correct across the full report. Simple language, radiology terminology, abbreviations, synonyms, and different levels of detail can match when they describe the same clinical finding. For example, "fracture in wrist" can match "distal radius cortical disruption" when the anatomy, laterality, and injury context are clinically consistent.

Every completed comparison is saved with the uploaded image, model report, AI reference report, judge findings, scores, and diagnoses. Local VS Code runs save to `./data`; Vercel deployments should use Supabase for persistent storage.

## Bone Fracture Benchmarking

The app also includes a separate **Fracture Benchmark** tab for batch X-ray fracture detection experiments.

It supports:

- Uploading many X-ray images at once or selecting a whole image folder.
- FracAtlas-style fracture/normal labels keyed by filename.
- MURA-style positive/negative study labels, including labels inferred from folder paths such as `positive`, `negative`, `fracture`, `normal`, or `abnormal`.
- Per-image fracture prediction with body region, confidence, visible findings, localization, and warnings.
- Benchmark metrics: accuracy, sensitivity, specificity, precision, F1, false negative rate, false positive rate, TP/TN/FP/FN counts, and dataset breakdowns.

For best results, paste or upload a CSV with columns like:

```csv
filename,label,dataset,body_region,fracture_type
FracAtlas_001.png,fracture,FracAtlas,wrist,distal radius
MURA_XR_HAND_002.png,normal,MURA,hand,
```

Use FracAtlas for fracture localization/binary fracture review and MURA for broad upper-extremity abnormality benchmarking. Keep validation splits separated by patient or study to avoid leakage.

## Local Setup

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. If another app is already using port 3000:

```bash
npm run dev -- -p 3001
```

## Where To Add API Keys

Create this file in the project root:

```text
.env.local
```

Add:

```env
OPENAI_API_KEY=your_openai_key_here
DEFAULT_REPORT_PROVIDER=openai
OPENAI_JUDGE_MODEL=gpt-4.1-mini
AUTH_SECRET=replace_with_a_long_random_session_secret
```

You can also paste a temporary API key into the settings panel in the app. Browser-entered keys are sent only with that request and are not stored by the app.

## Login And Audit Tracking

The app now requires login before users can run report generation, report comparison, DICOM analysis, fracture benchmarking, or view history.

For local admin testing, use:

```text
Email: admin@ai
Password: 123456789
```

Admins are redirected to the Admin monitoring tab and can view the activity audit log.

For Google login, create a Google OAuth Web Client ID and add:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
AUTH_SECRET=replace_with_a_long_random_session_secret
ADMIN_EMAIL=admin@ai
ADMIN_PASSWORD=123456789
```

If Google is not configured, the app shows a local name/email login so activity can still be tracked during local testing. Activity is saved to:

```text
data/audit-events.jsonl
```

Saved report comparisons also include `actor_name`, `actor_email`, and `actor_id`.

## Optional Database Storage With Supabase

For local testing, no database setup is required. The app saves records to:

```text
data/report-tests.jsonl
data/uploads/
```

For Vercel, use Supabase so saved tests persist.

Add these environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-server-only-secret-key
SUPABASE_BUCKET=monarcs-report-tests
```

Create a Supabase storage bucket named `monarcs-report-tests`. For quick testing, make it public so saved images can display in History.

Create this table in Supabase SQL editor:

```sql
create table if not exists monarcs_report_tests (
  id uuid primary key,
  created_at timestamptz not null,
  provider text not null,
  judge_model text,
  report_model text,
  image_name text,
  image_type text,
  image_url text,
  image_path text,
  model_report text not null,
  reference_report text not null,
  comparison jsonb not null,
  overall_score integer not null,
  pass boolean not null,
  model_diagnosis text,
  reference_diagnosis text,
  actor_id text,
  actor_name text,
  actor_email text
);
```

## Vercel Deployment

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Add environment variables:
   - `OPENAI_API_KEY`
   - `DEFAULT_REPORT_PROVIDER`
   - `OPENAI_JUDGE_MODEL`
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_BUCKET`
4. Deploy.

## Clinical Safety Notice

This app is for benchmarking and research workflow support only. It does not provide medical diagnosis and must not be used as the sole basis for patient care. All AI output must be reviewed by a qualified radiologist or clinician.

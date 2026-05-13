"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bone,
  BookOpen,
  Brain,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  History,
  Loader2,
  LogOut,
  Maximize2,
  Microscope,
  Scale,
  Settings,
  ShieldCheck,
  Target,
  Upload
} from "lucide-react";
import { ReportComparison } from "@/lib/types";
import type { StoredReportTest } from "@/lib/types";
import type { FractureBenchmarkResult } from "@/lib/fractureBenchmark";

type Tab = "report" | "fracture" | "dicom" | "results" | "history" | "audit" | "instructions";
type Provider = "openai" | "gemini";

const DICOM_VIEWER_URL = "https://dicomviewer.net/viewer2/localbasic";

type DicomScanBox = {
  label: string;
  confidence: "low" | "medium" | "high";
  tile: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
};

type DicomFolderScan = {
  review: {
    summary: string;
    possible_abnormalities: string[];
    possible_errors: string[];
    critical_finding_screen: string;
    recommendations: string[];
    limitations: string[];
    boxes: DicomScanBox[];
  };
  montage: string;
  montageSize: { width: number; height: number };
  metadata: {
    filesReceived: number;
    filesSelectedInFolder?: number;
    filesUploadedForScan: number;
    filesRendered: number;
    modality: string;
    studyDescription: string;
    seriesDescription: string;
    windowCenter: number;
    windowWidth: number;
  };
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
  method: "google" | "local";
  role: "admin" | "user";
};

type AuditEvent = {
  id: string;
  created_at: string;
  action: string;
  actor_name?: string;
  actor_email?: string;
  details?: Record<string, unknown>;
};

type FractureSampleCase = {
  file_name: string;
  image_url?: string;
  mura_region: string;
  fracture_type: string;
  fracture_count: number;
  boxes: Array<{ x: number; y: number; width: number; height: number }>;
  source_image_id?: string;
};

function metricColor(score: number) {
  if (score >= 85) return "good";
  if (score >= 70) return "warn";
  return "bad";
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function fileSortKey(file: File) {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  return path.replace(/\d+/g, (match) => match.padStart(8, "0"));
}

function sampleDicomFiles(files: File[], maxFiles: number) {
  const sorted = [...files].sort((left, right) => fileSortKey(left).localeCompare(fileSortKey(right)));
  if (sorted.length <= maxFiles) return sorted;
  const sampled: File[] = [];
  const step = sorted.length / maxFiles;
  for (let index = 0; index < maxFiles; index++) {
    sampled.push(sorted[Math.min(sorted.length - 1, Math.floor(index * step))]);
  }
  return sampled;
}

function buildFractureCaseTemplate(files: File[]) {
  const fractureTypes = [
    ["wrist", "distal radius fracture"],
    ["wrist", "scaphoid fracture"],
    ["hand", "metacarpal fracture"],
    ["finger", "phalangeal fracture"],
    ["forearm", "ulna shaft fracture"],
    ["elbow", "radial head fracture"],
    ["elbow", "olecranon fracture"],
    ["humerus", "humeral shaft fracture"],
    ["shoulder", "proximal humerus fracture"],
    ["shoulder", "clavicle fracture"]
  ];
  const cases = Array.from({ length: 10 }, (_, index) => {
    const file = files[index];
    const [muraRegion, fractureType] = fractureTypes[index];
    return {
      file_name: file ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name) : `mura_fracture_${String(index + 1).padStart(2, "0")}.png`,
      mura_region: muraRegion,
      fracture: "fracture",
      fracture_type: fractureType,
      fracture_count: 1,
      boxes: [
        {
          x: 40,
          y: 40,
          width: 18,
          height: 18
        }
      ],
      notes: "Edit the fracture type, count, and box coordinates before scoring."
    };
  });
  return JSON.stringify({ cases }, null, 2);
}

function SectionTitle({ icon, title, caption }: { icon: React.ReactNode; title: string; caption: string }) {
  return (
    <div className="section-title">
      <span className="section-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{caption}</p>
      </div>
    </div>
  );
}

function ScorePill({ score, label }: { score: number; label: string }) {
  return (
    <div className={`score-pill ${metricColor(score)}`}>
      <strong>{score}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("report");
  const provider: Provider = "gemini";
  const [reportModel, setReportModel] = useState("gemini-3.1-flash-lite");
  const [apiKey, setApiKey] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [referenceReport, setReferenceReport] = useState("");
  const [modelReport, setModelReport] = useState("");
  const [modelReportFile, setModelReportFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const [savedTests, setSavedTests] = useState<StoredReportTest[]>([]);
  const [busy, setBusy] = useState("");
  const [logs, setLogs] = useState<string[]>(["System ready. Add your API key or configure environment variables on Vercel."]);
  const [fractureImages, setFractureImages] = useState<File[]>([]);
  const [fractureResult, setFractureResult] = useState<FractureBenchmarkResult | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [googleClientId, setGoogleClientId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    loadSession();
  }, []);

  const latestOverall = useMemo(() => comparison?.overall_score ?? null, [comparison]);

  function log(message: string) {
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((items) => [`[${stamp}] ${message}`, ...items].slice(0, 18));
  }

  async function loadSession() {
    try {
      const response = await fetch("/api/auth/session");
      const json = await response.json();
      setUser(json.user || null);
      setGoogleClientId(json.googleClientId || "");
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSavedTests([]);
    setAuditEvents([]);
    log("Signed out.");
  }

  async function generateReferenceReport() {
    if (!imageFile) {
      log("Upload an image before generating the reference report.");
      return;
    }
    setBusy("reference");
    log(`Generating AI reference report from ${imageFile.name}.`);
    const form = new FormData();
    form.append("image", imageFile);
    form.append("provider", provider);
    form.append("model", reportModel);
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());
    try {
      const response = await fetch("/api/generate-report", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setReferenceReport(json.report);
      log("Reference report generated.");
    } catch (error: any) {
      log(`Reference generation failed: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function compareReports() {
    if (!referenceReport.trim()) {
      log("Generate or paste the reference report first.");
      return;
    }
    if (!modelReport.trim() && !modelReportFile) {
      log("Upload or paste your model's report before comparison.");
      return;
    }
    setBusy("compare");
    log("Running report-to-report judge.");
    const form = new FormData();
    form.append("provider", provider);
    form.append("referenceReport", referenceReport);
    form.append("modelReport", modelReport);
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());
    if (modelReportFile) form.append("reportFile", modelReportFile);
    if (imageFile) form.append("image", imageFile);
    form.append("reportModel", reportModel);
    try {
      const response = await fetch("/api/compare-reports", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setComparison(json.result);
      if (json.modelReport) setModelReport(json.modelReport);
      if (json.storedTest) setSavedTests((items) => [json.storedTest, ...items.filter((item) => item.id !== json.storedTest.id)]);
      setTab("results");
      log(`Report comparison complete and saved: ${json.result.overall_score}/100.`);
    } catch (error: any) {
      log(`Comparison failed: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function loadHistory() {
    setBusy("history");
    log("Loading saved comparison tests.");
    try {
      const response = await fetch("/api/tests?limit=50");
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setSavedTests(json.tests || []);
      log(`Loaded ${json.tests?.length || 0} saved test(s).`);
    } catch (error: any) {
      log(`History load failed: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function loadAudit() {
    setBusy("audit");
    log("Loading user activity log.");
    try {
      const response = await fetch("/api/audit?limit=100");
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setAuditEvents(json.events || []);
      log(`Loaded ${json.events?.length || 0} audit event(s).`);
    } catch (error: any) {
      log(`Audit load failed: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function runFractureBenchmark(userPredictions?: string) {
    setBusy("fracture");
    setFractureResult(null);
    const modeLabel = userPredictions ? "your model's predictions" : "built-in AI";
    log(`Running 10-case fracture benchmark using ${modeLabel} — ground truth hidden until complete.`);
    const form = new FormData();
    form.append("provider", provider);
    form.append("model", reportModel);
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());
    if (userPredictions) form.append("userPredictions", userPredictions);
    try {
      const response = await fetch("/api/benchmark-fractures", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setFractureResult(json);
      log(`Fracture benchmark complete — overall ${json.metrics?.overall_score || 0}%, mIoU ${json.metrics?.localization_miou || 0}%. Ground truth revealed.`);
    } catch (error: any) {
      log(`Fracture benchmark failed: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  function exportLatest(format: "json" | "html") {
    const payload = { generated_at: new Date().toISOString(), report_comparison: comparison };
    if (format === "json") {
      downloadFile("monarcs-report-comparison.json", JSON.stringify(payload, null, 2), "application/json");
      return;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>MONARCS Report Comparison</title><style>body{font-family:Arial,sans-serif;line-height:1.5;margin:32px;color:#172033}pre{white-space:pre-wrap;background:#f2f5f9;padding:16px;border-radius:8px}</style></head><body><h1>MONARCS Report Comparison</h1><p>Generated ${new Date().toLocaleString()}</p><pre>${JSON.stringify(payload, null, 2)}</pre></body></html>`;
    downloadFile("monarcs-report-comparison.html", html, "text/html");
  }

  return (
    <main>
      {!user && (
        <LoginGate
          loading={authLoading}
          googleClientId={googleClientId}
          onLogin={(nextUser) => {
            setUser(nextUser);
            if (nextUser.role === "admin") {
              setTab("audit");
              setTimeout(loadAudit, 0);
            }
            log(`Signed in as ${nextUser.name}.`);
          }}
        />
      )}
      <header className="topbar">
        <div className="brand">
          <div className="logo"><Microscope size={24} /></div>
          <div>
            <strong>MONARCS</strong>
            <span>Report Judge</span>
          </div>
        </div>
        <nav>
          <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}><Scale size={18} /> Report Judge</button>
          <button className={tab === "fracture" ? "active" : ""} onClick={() => setTab("fracture")}><Bone size={18} /> Fracture Benchmark</button>
          <button className={tab === "dicom" ? "active" : ""} onClick={() => setTab("dicom")}><ImageIcon size={18} /> DICOM Viewer</button>
          <button className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}><BarChart3 size={18} /> Results</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => { setTab("history"); loadHistory(); }}><History size={18} /> History</button>
          {user?.role === "admin" && <button className={tab === "audit" ? "active" : ""} onClick={() => { setTab("audit"); loadAudit(); }}><ShieldCheck size={18} /> Admin</button>}
          <button className={tab === "instructions" ? "active" : ""} onClick={() => setTab("instructions")}><BookOpen size={18} /> How To</button>
        </nav>
        <div className="user-cluster">
          <div className="system-pill"><span /> {user ? `${user.role === "admin" ? "Admin" : "User"}: ${user.name}` : latestOverall === null ? "Login Required" : `Latest ${latestOverall}/100`}</div>
          {user && <button className="icon-button" onClick={logout} title="Sign out"><LogOut size={18} /></button>}
        </div>
      </header>

      <section className="hero-band">
        <div>
          <h1>Radiology report-to-report comparison</h1>
          <p>Upload the scan image, generate an AI reference report, upload the tested model's report, then score diagnostic match, semantic clinical meaning, safety, hallucinations, and completeness.</p>
        </div>
        <div className="settings-panel">
          <div className="mini-title"><Settings size={16} /> Judge Settings</div>
          <div className="settings-grid">
            <label>
              Report model
              <input value={reportModel} readOnly />
            </label>
            <label>
              Optional API key
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Uses env var if empty" type="password" />
            </label>
          </div>
        </div>
      </section>

      {tab === "report" && (
        <section className="workspace two-col">
          <div className="panel">
            <SectionTitle icon={<ImageIcon />} title="1. Image + Reference" caption="Upload the same radiology image your model analyzed." />
            <label className="upload-box">
              <Upload size={28} />
              <span>{imageFile ? imageFile.name : "Upload X-ray / CT / MRI image"}</span>
              <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
            </label>
            {imagePreview && <img className="preview" src={imagePreview} alt="Uploaded radiology scan preview" />}
            <button className="primary" onClick={generateReferenceReport} disabled={busy === "reference"}>
              {busy === "reference" ? <Loader2 className="spin" /> : <Brain />} Generate AI Reference Report
            </button>
            <textarea className="report-box tall" value={referenceReport} onChange={(event) => setReferenceReport(event.target.value)} placeholder="Reference report appears here. You can also paste a radiologist/reference report manually." />
          </div>

          <div className="panel">
            <SectionTitle icon={<FileText />} title="2. Your Model Report" caption="Upload PDF/TXT or paste the output produced by the tested model." />
            <label className="upload-box compact">
              <Upload size={24} />
              <span>{modelReportFile ? modelReportFile.name : "Upload model report PDF/TXT"}</span>
              <input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(event) => setModelReportFile(event.target.files?.[0] || null)} />
            </label>
            <textarea className="report-box" value={modelReport} onChange={(event) => setModelReport(event.target.value)} placeholder="Paste your model's MONARCS-format radiology report here..." />
            <button className="accent" onClick={compareReports} disabled={busy === "compare"}>
              {busy === "compare" ? <Loader2 className="spin" /> : <Scale />} Compare & Score Reports
            </button>
            <div className="log-panel">
              <div className="mini-title"><Activity size={16} /> Pipeline Logs</div>
              {logs.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
            </div>
          </div>
        </section>
      )}

      {tab === "fracture" && (
        <FractureBenchmark
          result={fractureResult}
          busy={busy === "fracture"}
          onRun={runFractureBenchmark}
        />
      )}

      {tab === "dicom" && <DicomViewer provider={provider} reportModel={reportModel} apiKey={apiKey} log={log} />}

      {tab === "results" && (
        <section className="workspace">
          <div className="result-actions">
            <button className="secondary" onClick={() => exportLatest("json")}><Download /> Export JSON</button>
            <button className="secondary" onClick={() => exportLatest("html")}><Download /> Export HTML</button>
          </div>
          {comparison ? <ReportResult result={comparison} /> : <div className="empty">No results yet. Run a report comparison first.</div>}
        </section>
      )}

      {tab === "history" && (
        <HistoryView tests={savedTests} loading={busy === "history"} onRefresh={loadHistory} />
      )}

      {tab === "audit" && (
        <AuditView events={auditEvents} loading={busy === "audit"} onRefresh={loadAudit} />
      )}

      {tab === "instructions" && <Instructions />}
    </main>
  );
}

function LoginGate({
  loading,
  googleClientId,
  onLogin
}: {
  loading: boolean;
  googleClientId: string;
  onLogin: (user: AuthUser) => void;
}) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"staff" | "admin">("staff");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;

    function renderButton() {
      const google = (window as any).google;
      if (!google?.accounts?.id || !googleButtonRef.current) return;
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential: string }) => {
          setBusy(true);
          setError("");
          try {
            const login = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: response.credential })
            });
            const json = await login.json();
            if (!login.ok) throw new Error(json.error);
            onLogin(json.user);
          } catch (err: any) {
            setError(err.message || "Google login failed.");
          } finally {
            setBusy(false);
          }
        }
      });
      googleButtonRef.current.innerHTML = "";
      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_blue",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 280
      });
    }

    if ((window as any).google?.accounts?.id) {
      renderButton();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderButton;
    document.head.appendChild(script);
  }, [googleClientId, onLogin]);

  async function localLogin(nextMode = mode) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode, name, email, password })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      onLogin(json.user);
    } catch (err: any) {
      setError(err.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-shell">
        <aside className="login-story">
          <div className="brand login-brand">
            <div className="logo"><Microscope size={24} /></div>
            <div>
              <strong>MONARCS</strong>
              <span>Clinical AI Benchmarking</span>
            </div>
          </div>
          <div className="login-copy">
            <span className="eyebrow">Secure workspace</span>
            <h1>Benchmark radiology AI with accountable user activity.</h1>
            <p>Track who generated reports, ran fracture tests, reviewed DICOM studies, and exported evidence. Admins get a dedicated monitoring console.</p>
          </div>
          <div className="login-stats">
            <div><strong>Report</strong><span>Semantic judge</span></div>
            <div><strong>Fracture</strong><span>Batch metrics</span></div>
            <div><strong>DICOM</strong><span>AI review log</span></div>
          </div>
        </aside>

        <section className="login-panel">
          <div className="login-panel-head">
            <span className="eyebrow">{mode === "admin" ? "Admin access" : "Staff access"}</span>
            <h2>{mode === "admin" ? "Admin monitor login" : "Sign in to continue"}</h2>
            <p>{mode === "admin" ? "Use the admin account to view activity across the benchmark workspace." : "Choose Google sign-in when configured, or use local staff login for testing."}</p>
          </div>

          {loading ? (
            <div className="inline-status"><Loader2 className="spin" size={16} /><span>Checking session...</span></div>
          ) : (
            <>
              <div className="login-tabs">
                <button className={mode === "staff" ? "active" : ""} onClick={() => { setMode("staff"); setError(""); }}>Staff</button>
                <button className={mode === "admin" ? "active" : ""} onClick={() => { setMode("admin"); setEmail(""); setPassword(""); setError(""); }}>Admin</button>
              </div>

              {mode === "staff" && (
                <>
                  {googleClientId ? (
                    <div className="google-login-button" ref={googleButtonRef} />
                  ) : (
                    <div className="google-disabled">
                      <ShieldCheck size={18} />
                      <div>
                        <strong>Continue with Google is not configured</strong>
                        <span>Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and restart `npm run dev` to show the Google button.</span>
                      </div>
                    </div>
                  )}
                  <div className="login-divider"><span>or use local staff login</span></div>
                  <div className="settings-grid">
                    <label>
                      Name
                      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Radiologist / tester name" />
                    </label>
                    <label>
                      Email
                      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
                    </label>
                  </div>
                </>
              )}

              {mode === "admin" && (
                <div className="admin-form">
                  <label>
                    Admin email
                    <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter admin email" autoComplete="username" />
                  </label>
                  <label>
                    Password
                    <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" type="password" autoComplete="current-password" />
                  </label>
                  <div className="inline-status admin-hint"><ShieldCheck size={16} /><span>Admin credentials are managed through environment variables.</span></div>
                </div>
              )}

              <button className="primary login-submit" onClick={() => localLogin()} disabled={busy}>
                {busy ? <Loader2 className="spin" /> : <ShieldCheck />} {mode === "admin" ? "Enter Admin Console" : "Login To Workspace"}
              </button>
              {error && <div className="inline-error"><AlertTriangle size={18} /><span>{error}</span></div>}
              <p className="login-footnote">Sessions last 12 hours. All benchmark actions are written to the audit trail.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const BUILT_IN_IMAGES = [
  { file_name: "fracatlas_01_IMG0000019.jpg", mura_region: "hand" },
  { file_name: "fracatlas_02_IMG0000025.jpg", mura_region: "hand" },
  { file_name: "fracatlas_03_IMG0000261.jpg", mura_region: "hand" },
  { file_name: "fracatlas_04_IMG0000307.jpg", mura_region: "hand" },
  { file_name: "fracatlas_05_IMG0000092.jpg", mura_region: "leg" },
  { file_name: "fracatlas_06_IMG0000466.jpg", mura_region: "leg" },
  { file_name: "fracatlas_07_IMG0002180.jpg", mura_region: "hip" },
  { file_name: "fracatlas_08_IMG0003341.jpg", mura_region: "hip" },
  { file_name: "fracatlas_09_IMG0002302.jpg", mura_region: "shoulder" },
  { file_name: "fracatlas_10_IMG0002620.jpg", mura_region: "shoulder" }
];

function FractureBenchmark({
  result,
  busy,
  onRun
}: {
  result: FractureBenchmarkResult | null;
  busy: boolean;
  onRun: (userPredictions?: string) => void;
}) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [predictionJson, setPredictionJson] = useState("");
  const [predictionFileName, setPredictionFileName] = useState("");
  const [userImages, setUserImages] = useState<{ fileName: string; url: string }[]>([]);

  function exportFractureBenchmark() {
    if (!result) return;
    downloadFile("fracture-localization-results.json", JSON.stringify({ generated_at: new Date().toISOString(), ...result }, null, 2), "application/json");
  }

  function downloadTemplate() {
    const template = {
      instructions: "Fill in your model's predicted fracture boxes for each image. Coordinates are percentages (0-100) of image width/height.",
      cases: BUILT_IN_IMAGES.map((img) => ({
        file_name: img.file_name,
        mura_region: img.mura_region,
        predicted_fracture: "",
        predicted_fracture_type: "",
        predicted_fracture_count: 0,
        boxes: []
      }))
    };
    downloadFile("fracture-prediction-template.json", JSON.stringify(template, null, 2), "application/json");
  }

  function handlePredictionFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPredictionFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setPredictionJson(String(e.target?.result || ""));
    reader.readAsText(file);
  }

  function handleUserImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const previews = files.map((file) => ({
      fileName: file.name,
      url: URL.createObjectURL(file)
    }));
    setUserImages(previews);
  }

  return (
    <section className="workspace fracture-workspace">
      <div className="fracture-layout">
        <div className="panel">
          <SectionTitle icon={<Bone />} title="10-Image Bone Fracture Benchmark" caption="FracAtlas X-rays from MURA regions. Ground-truth boxes are hidden and revealed only after scoring." />

          <div className="fracture-sample-grid">
            {BUILT_IN_IMAGES.map((img, index) => {
              const revealed = result?.groundTruth?.find((gt) => gt.file_name === img.file_name);
              const uploaded = userImages.find((u) => u.fileName === img.file_name) || userImages[index];
              const imgSrc = uploaded?.url || `/fracture-samples/${img.file_name}`;
              return (
                <div className="fracture-sample-card" key={img.file_name}>
                  <div className="fracture-image-wrap">
                    <img src={imgSrc} alt={`${img.mura_region} X-ray`} />
                    {revealed?.boxes.map((box, i) => (
                      <span key={i} className="truth-box" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }} />
                    ))}
                  </div>
                  {revealed ? (
                    <>
                      <strong>{revealed.fracture_type}</strong>
                      <span>{revealed.mura_region} · {revealed.fracture_count} fracture(s)</span>
                    </>
                  ) : (
                    <span className="hidden-label">{img.mura_region} · ground truth hidden</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="fracture-actions">
            <a className="secondary link-button" href="/fracture-samples/fracatlas-10-fracture-samples.zip" download>
              <Download /> Download Images
            </a>
            <button className="secondary" onClick={downloadTemplate}>
              <Download /> Download Template JSON
            </button>
          </div>

          <div className="login-tabs" style={{ marginTop: "1rem" }}>
            <button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>Built-in AI</button>
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>Upload My Model&apos;s Predictions</button>
          </div>

          {mode === "manual" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                Step 1 — Download the 10 images above and run your model on them.<br />
                Step 2 — Upload your images below so they appear in the grid.<br />
                Step 3 — Download the template JSON, fill in your predictions, and upload it.<br />
                Step 4 — Click Compare Scores.
              </p>

              <label className="upload-box" style={{ minHeight: "64px" }}>
                <Upload size={20} />
                <span>
                  {userImages.length > 0
                    ? `${userImages.length} image(s) uploaded — showing in grid above`
                    : "Step 2 — Upload your 10 X-ray images"}
                </span>
                <input type="file" multiple accept="image/*,.png,.jpg,.jpeg,.webp" onChange={handleUserImages} />
              </label>

              <label className="upload-box" style={{ minHeight: "64px" }}>
                <FileText size={20} />
                <span>{predictionFileName ? `${predictionFileName} loaded` : "Step 3 — Upload your predictions JSON"}</span>
                <input type="file" accept=".json,application/json" onChange={handlePredictionFile} />
              </label>

              {predictionJson && (
                <textarea
                  className="report-box labels-box"
                  style={{ minHeight: "100px", fontSize: "0.78rem" }}
                  value={predictionJson}
                  onChange={(e) => setPredictionJson(e.target.value)}
                  placeholder="Your predictions JSON appears here. You can also paste it directly."
                />
              )}
            </div>
          )}

          <button
            className="accent"
            onClick={() => onRun(mode === "manual" ? predictionJson : undefined)}
            disabled={busy || (mode === "manual" && !predictionJson.trim())}
          >
            {busy ? <Loader2 className="spin" /> : <Target />}
            {busy ? "Scoring… ground truth hidden until complete" : "Compare Scores"}
          </button>

          <div className="notice compact-notice">
            <AlertTriangle size={20} />
            <p>Ground-truth bounding boxes are hidden until you click Compare Scores. Images are from the FracAtlas dataset (CC BY 4.0).</p>
          </div>
        </div>

        <div className="panel fracture-guide">
          <SectionTitle icon={<BarChart3 />} title="Scoring Design" caption="Weighted metrics for fracture localization benchmarking." />
          <div className="metric-list fracture-metric-list">
            <span><CheckCircle2 size={16} /> Localization mIoU, 45%</span>
            <span><CheckCircle2 size={16} /> Fracture type accuracy, 20%</span>
            <span><CheckCircle2 size={16} /> Fracture count accuracy, 15%</span>
            <span><CheckCircle2 size={16} /> Fracture detection accuracy, 15%</span>
            <span><CheckCircle2 size={16} /> Confidence alignment, 5%</span>
          </div>
          <div className="benchmark-notes">
            <h3>How it works</h3>
            <p>Click <strong>Compare Scores</strong> — the AI model analyzes all 10 X-rays and predicts fracture locations. Results are scored against the hidden ground truth, which is then revealed.</p>
            <p>Download the plain images and template JSON to run your own model offline, then compare results here.</p>
            <p>{result ? `${result.metrics.total} scored case(s) in the latest result.` : "Ground truth revealed after scoring."}</p>
          </div>
        </div>
      </div>

      {result && (
        <div className="panel fracture-results">
          <div className="history-head">
            <SectionTitle icon={<Target />} title="Fracture Benchmark Results" caption={result.summary} />
            <button className="secondary" onClick={exportFractureBenchmark}><Download /> Export JSON</button>
          </div>
          <FractureMetrics metrics={result.metrics} />
          <div className="dataset-breakdown">
            {result.scoring.map((item) => (
              <div key={item.metric} className="dataset-card">
                <strong>{item.metric}</strong>
                <span>{item.weight}% weight</span>
                <span>{item.description}</span>
              </div>
            ))}
          </div>
          <div className="fracture-table-wrap">
            <table className="fracture-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Truth Type</th>
                  <th>Predicted Type</th>
                  <th>Boxes</th>
                  <th>mIoU</th>
                  <th>Count</th>
                  <th>Case Score</th>
                  <th>Region</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.cases.map((item) => (
                  <tr key={`${item.file_name}-${item.scores.case_score}`}>
                    <td>{item.file_name}</td>
                    <td>{item.ground_truth.fracture_type}</td>
                    <td>{item.prediction.predicted_fracture_type}</td>
                    <td>{item.ground_truth.boxes.length} truth / {item.prediction.boxes.length} predicted</td>
                    <td>{formatMetric(item.scores.mean_iou)}</td>
                    <td>{item.ground_truth.fracture_count} truth / {item.prediction.predicted_fracture_count} predicted</td>
                    <td><span className={`match ${metricColor(item.scores.case_score)}`}>{item.scores.case_score}%</span></td>
                    <td>{item.ground_truth.mura_region}</td>
                    <td>{item.prediction.confidence}%</td>
                    <td>{item.prediction.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DiffList title="Benchmark Guidance" items={result.guidance} />
        </div>
      )}
    </section>
  );
}

function formatMetric(value: number | null) {
  return value === null ? "n/a" : `${value}%`;
}

function FractureMetrics({ metrics }: { metrics: FractureBenchmarkResult["metrics"] }) {
  return (
    <div className="score-grid fracture-score-grid">
      <ScorePill score={metrics.overall_score} label={`Overall ${formatMetric(metrics.overall_score)}`} />
      <ScorePill score={metrics.localization_miou} label={`mIoU ${formatMetric(metrics.localization_miou)}`} />
      <ScorePill score={metrics.localization_score} label={`Localization ${formatMetric(metrics.localization_score)}`} />
      <ScorePill score={metrics.fracture_type_accuracy} label={`Type ${formatMetric(metrics.fracture_type_accuracy)}`} />
      <ScorePill score={metrics.fracture_count_accuracy} label={`Count ${formatMetric(metrics.fracture_count_accuracy)}`} />
      <ScorePill score={metrics.detection_accuracy} label={`Detection ${formatMetric(metrics.detection_accuracy)}`} />
      <ScorePill score={metrics.confidence_alignment} label={`Confidence ${formatMetric(metrics.confidence_alignment)}`} />
      <ScorePill score={metrics.total === 10 ? 100 : metrics.total * 10} label={`${metrics.total}/10 scored`} />
    </div>
  );
}

function DicomViewer({
  provider,
  reportModel,
  apiKey,
  log
}: {
  provider: Provider;
  reportModel: string;
  apiKey: string;
  log: (message: string) => void;
}) {
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewPreview, setReviewPreview] = useState("");
  const [clinicalQuestion, setClinicalQuestion] = useState("");
  const [aiReview, setAiReview] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [dicomFolderFiles, setDicomFolderFiles] = useState<File[]>([]);
  const [dicomScan, setDicomScan] = useState<DicomFolderScan | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderStatus, setFolderStatus] = useState("");
  const [folderError, setFolderError] = useState("");

  useEffect(() => {
    if (!reviewFile) {
      setReviewPreview("");
      return;
    }
    const url = URL.createObjectURL(reviewFile);
    setReviewPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [reviewFile]);

  async function analyzeDicomImage() {
    if (!reviewFile) {
      log("Upload a DICOM viewer screenshot or exported key image before AI review.");
      return;
    }
    setReviewBusy(true);
    log(`Running AI abnormality review for ${reviewFile.name}.`);
    const form = new FormData();
    form.append("image", reviewFile);
    form.append("provider", provider);
    form.append("model", reportModel);
    form.append("clinicalQuestion", clinicalQuestion);
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());

    try {
      const response = await fetch("/api/analyze-dicom", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setAiReview(json.review);
      log("AI abnormality review complete.");
    } catch (error: any) {
      log(`AI abnormality review failed: ${error.message}`);
    } finally {
      setReviewBusy(false);
    }
  }

  async function analyzeDicomFolder() {
    if (!dicomFolderFiles.length) {
      log("Select a DICOM folder before running the AI folder scan.");
      return;
    }

    const sampledFiles = sampleDicomFiles(dicomFolderFiles, 48);
    setFolderBusy(true);
    setDicomScan(null);
    setFolderError("");
    setFolderStatus(`Preparing ${sampledFiles.length} representative DICOM slice(s) from ${dicomFolderFiles.length} selected file(s)...`);
    log(`Scanning DICOM folder: ${dicomFolderFiles.length} file(s) selected, ${sampledFiles.length} sent for AI montage.`);

    const form = new FormData();
    form.append("provider", provider);
    form.append("model", reportModel);
    form.append("totalSelected", String(dicomFolderFiles.length));
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());
    sampledFiles.forEach((file) => form.append("dicomFiles", file, file.name));

    try {
      setFolderStatus("Uploading selected DICOM slices and rendering AI montage...");
      const response = await fetch("/api/analyze-dicom-folder", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setDicomScan(json);
      setFolderStatus(`Scan complete. ${json.review?.boxes?.length || 0} suspicious region(s) boxed.`);
      log(`DICOM AI scan complete: ${json.review?.boxes?.length || 0} boxed region(s).`);
    } catch (error: any) {
      setFolderError(error.message || "DICOM AI scan failed.");
      setFolderStatus("");
      log(`DICOM AI scan failed: ${error.message}`);
    } finally {
      setFolderBusy(false);
    }
  }

  return (
    <section className="workspace dicom-workspace">
      <div className="dicom-layout">
        <div className="panel dicom-panel">
          <div className="dicom-head">
            <SectionTitle icon={<ImageIcon />} title="DICOM Viewer" caption="OHIF-based local DICOM review for DCM files and folders." />
            <div className="dicom-actions">
              <a className="secondary link-button" href={DICOM_VIEWER_URL} target="_blank" rel="noreferrer">
                <Maximize2 size={18} /> Open Full Screen
              </a>
              <a className="secondary link-button" href="https://github.com/OHIF/Viewers" target="_blank" rel="noreferrer">
                <ExternalLink size={18} /> OHIF
              </a>
            </div>
          </div>
          <div className="dicom-frame-shell">
            <iframe
              title="OHIF DICOM Viewer"
              src={DICOM_VIEWER_URL}
              allow="fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="panel dicom-review-panel">
          <SectionTitle icon={<Brain />} title="AI DICOM Folder Scan" caption="Upload a DICOM folder, generate a montage, and box suspicious visible regions." />
          <label className="upload-box compact dicom-folder-box">
            <Upload size={24} />
            <span>{dicomFolderFiles.length ? `${dicomFolderFiles.length} DICOM file(s) selected` : "Upload full DICOM folder"}</span>
            <input
              type="file"
              multiple
              onChange={(event) => setDicomFolderFiles(Array.from(event.target.files || []))}
              {...({ webkitdirectory: "", directory: "" } as any)}
            />
          </label>
          <button className="accent" onClick={analyzeDicomFolder} disabled={folderBusy}>
            {folderBusy ? <Loader2 className="spin" /> : <Brain />} Scan Folder & Draw Boxes
          </button>
          {folderStatus && <div className="inline-status">{folderBusy && <Loader2 className="spin" size={16} />}<span>{folderStatus}</span></div>}
          {folderError && <div className="inline-error"><AlertTriangle size={18} /><span>{folderError}</span></div>}

          {dicomScan && (
            <div className="dicom-scan-output">
              <div className="scan-meta">
                <span>{dicomScan.metadata.modality}</span>
                <span>{dicomScan.metadata.studyDescription}</span>
                <span>{dicomScan.metadata.filesSelectedInFolder || dicomScan.metadata.filesReceived} selected</span>
                <span>{dicomScan.metadata.filesRendered} tiles</span>
              </div>
              <div className="dicom-montage-wrap">
                <img src={dicomScan.montage} alt="DICOM AI scan montage with bounding boxes" />
                {dicomScan.review.boxes.map((box, index) => (
                  <div
                    key={`${box.label}-${index}`}
                    className={`dicom-box ${box.confidence}`}
                    style={{
                      left: `${(box.x / dicomScan.montageSize.width) * 100}%`,
                      top: `${(box.y / dicomScan.montageSize.height) * 100}%`,
                      width: `${(box.width / dicomScan.montageSize.width) * 100}%`,
                      height: `${(box.height / dicomScan.montageSize.height) * 100}%`
                    }}
                  >
                    <span>{box.label}</span>
                  </div>
                ))}
              </div>
              <DicomScanReport scan={dicomScan} />
            </div>
          )}

          <div className="review-divider" />
          <SectionTitle icon={<Brain />} title="Screenshot Review" caption="Optional fallback for a single exported viewer image." />
          <label className="upload-box compact">
            <Upload size={24} />
            <span>{reviewFile ? reviewFile.name : "Upload screenshot / key image"}</span>
            <input type="file" accept="image/*,.png,.jpg,.jpeg,.webp" onChange={(event) => setReviewFile(event.target.files?.[0] || null)} />
          </label>
          {reviewPreview && <img className="preview dicom-review-preview" src={reviewPreview} alt="DICOM viewer screenshot preview" />}
          <label>
            Focus question or suspected error
            <input
              value={clinicalQuestion}
              onChange={(event) => setClinicalQuestion(event.target.value)}
              placeholder="Example: check for fracture, bleed, pneumonia, wrong laterality..."
            />
          </label>
          <button className="primary" onClick={analyzeDicomImage} disabled={reviewBusy}>
            {reviewBusy ? <Loader2 className="spin" /> : <Brain />} Analyze Abnormalities
          </button>
          <textarea
            className="report-box dicom-review-box"
            value={aiReview}
            onChange={(event) => setAiReview(event.target.value)}
            placeholder="AI review appears here. Use it to flag possible abnormalities or interpretation mistakes for radiologist review."
          />
          <div className="notice compact-notice">
            <AlertTriangle size={20} />
            <p>Screening only. This cannot replace full-series review by a qualified radiologist.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DicomScanReport({ scan }: { scan: DicomFolderScan }) {
  const review = scan.review;
  return (
    <div className="dicom-scan-report">
      <h3>AI Folder Scan Report</h3>
      <p>{review.summary}</p>
      <ReportList title="Possible Abnormalities" items={review.possible_abnormalities} />
      <ReportList title="Possible Errors" items={review.possible_errors} />
      <div className="scan-section">
        <strong>Critical finding screen</strong>
        <p>{review.critical_finding_screen}</p>
      </div>
      <ReportList title="Recommendations" items={review.recommendations} />
      <ReportList title="Limitations" items={review.limitations} />
      {review.boxes.length > 0 && (
        <div className="scan-section">
          <strong>Boxed Regions</strong>
          {review.boxes.map((box, index) => (
            <p key={`${box.label}-${index}`}>
              Tile {box.tile}: {box.label} ({box.confidence}) - {box.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="scan-section">
      <strong>{title}</strong>
      {items.map((item, index) => <p key={`${title}-${index}`}>{item}</p>)}
    </div>
  );
}

function HistoryView({ tests, loading, onRefresh }: { tests: StoredReportTest[]; loading: boolean; onRefresh: () => void }) {
  return (
    <section className="workspace">
      <div className="panel">
        <div className="history-head">
          <SectionTitle icon={<History />} title="Saved Tests" caption="Every completed report comparison is stored with the image, reports, findings, and judge result." />
          <button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? <Loader2 className="spin" /> : <History />} Refresh</button>
        </div>
        {tests.length === 0 ? (
          <div className="empty">No saved tests yet. Run a comparison first.</div>
        ) : (
          <div className="history-list">
            {tests.map((test) => (
              <details key={test.id} className="history-item">
                <summary>
                  <span>{new Date(test.created_at).toLocaleString()}</span>
                  <b className={metricColor(test.overall_score)}>{test.overall_score}/100</b>
                  <em>{test.pass ? "PASS" : "REVIEW"}</em>
                  <span>{test.image_name || "No image name"} {test.actor_name ? `- ${test.actor_name}` : ""}</span>
                </summary>
                <div className="history-detail">
                  {(test.image_url || test.image_path) && <img src={test.image_url || `/api/tests/${test.id}/image`} alt={test.image_name || "Saved radiology scan"} />}
                  <div className="diagnosis-box">
                    <strong>Diagnosis</strong>
                    <p>Model: {test.model_diagnosis || "Not stated"}</p>
                    <p>Reference: {test.reference_diagnosis || "Not stated"}</p>
                  </div>
                  <ReportResult result={test.comparison} />
                  <div className="diff-grid">
                    <div className="diff-section">
                      <h3>model report</h3>
                      <p>{test.model_report}</p>
                    </div>
                    <div className="diff-section">
                      <h3>reference report</h3>
                      <p>{test.reference_report}</p>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AuditView({ events, loading, onRefresh }: { events: AuditEvent[]; loading: boolean; onRefresh: () => void }) {
  return (
    <section className="workspace">
      <div className="panel">
        <div className="history-head">
          <SectionTitle icon={<ShieldCheck />} title="Activity Audit" caption="User activity for logins, report comparisons, DICOM scans, and fracture benchmarks." />
          <button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? <Loader2 className="spin" /> : <ShieldCheck />} Refresh</button>
        </div>
        {events.length === 0 ? (
          <div className="empty">No activity logged yet.</div>
        ) : (
          <div className="audit-list">
            {events.map((event) => (
              <div className="audit-item" key={event.id}>
                <span>{new Date(event.created_at).toLocaleString()}</span>
                <strong>{event.action}</strong>
                <span>{event.actor_name || "Unknown user"}</span>
                <span>{event.actor_email || ""}</span>
                <code>{event.details ? JSON.stringify(event.details) : "{}"}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ReportResult({ result }: { result: ReportComparison }) {
  const metrics = result.metric_scores;
  return (
    <div className="panel result-panel">
      <SectionTitle icon={<Scale />} title="Report Comparison Result" caption="LLM judge output for submitted report vs image-derived reference." />
      <div className="score-row">
        <div className={`big-score ${metricColor(result.overall_score)}`}>
          <strong>{result.overall_score}</strong><span>/100</span>
          <em>{result.pass ? "PASS" : "REVIEW REQUIRED"}</em>
        </div>
        <p>{result.judge_summary}</p>
      </div>
      <div className="score-grid">
        <ScorePill score={metrics.findings_match} label="Findings" />
        <ScorePill score={metrics.impression_accuracy} label="Impression" />
        <ScorePill score={metrics.recommendation_alignment} label="Recommendation" />
        <ScorePill score={metrics.safety_score} label="Safety" />
        <ScorePill score={metrics.completeness} label="Completeness" />
        <ScorePill score={metrics.clinical_language} label="Clinical Language" />
        <ScorePill score={metrics.hallucination_control} label="Hallucination" />
        <ScorePill score={metrics.negative_marking} label="Negative Marking" />
      </div>
      <div className="diagnosis-box">
        <strong>Disease/Diagnosis Check: {result.disease_prediction.status.replace("_", " ")}</strong>
        <p>Model: {result.disease_prediction.model_diagnosis || "Not stated"}</p>
        <p>Reference: {result.disease_prediction.reference_diagnosis || "Not stated"}</p>
        <p>{result.disease_prediction.explanation}</p>
      </div>
      <div className="strict-box">
        <h3>Strict Match Checks</h3>
        <div className="strict-grid">
          <StrictFlag ok={result.strict_mismatch.same_exam_type} label="Same exam type" />
          <StrictFlag ok={result.strict_mismatch.same_body_region} label="Same body region" />
          <StrictFlag ok={result.strict_mismatch.same_laterality} label="Same laterality" />
          <StrictFlag ok={result.strict_mismatch.same_primary_diagnosis} label="Same diagnosis" />
          <StrictFlag ok={result.strict_mismatch.normal_vs_abnormal_match} label="Normal/abnormal match" />
          <StrictFlag ok={!result.strict_mismatch.critical_finding_missed} label="No critical miss" />
          <StrictFlag ok={!result.strict_mismatch.major_unsupported_diagnosis} label="No major hallucination" />
        </div>
        <p>{result.strict_mismatch.explanation}</p>
      </div>
      <DiffList title="Key Differences" items={result.key_differences} />
      <DiffList title="Missing Findings" items={result.missing_findings} />
      <DiffList title="Unsupported Claims" items={result.unsupported_claims} />
      <div className="diff-grid">
        {Object.entries(result.section_diff).map(([section, value]) => (
          <div className="diff-section" key={section}>
            <h3>{section.replaceAll("_", " ")}</h3>
            <div><b>Your model</b><p>{value.model || "Not provided"}</p></div>
            <div><b>Reference</b><p>{value.reference || "Not provided"}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StrictFlag({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? "strict-ok" : "strict-bad"}>{ok ? "PASS" : "FAIL"} - {label}</span>;
}

function DiffList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="diff-list">
      <h3>{title}</h3>
      {items.map((item, index) => <p key={`${title}-${index}`}><b>{index + 1}.</b> {item}</p>)}
    </div>
  );
}

function Instructions() {
  return (
    <section className="workspace">
      <div className="panel instructions">
        <SectionTitle icon={<BookOpen />} title="How To Use" caption="Report-to-report benchmarking for radiology model outputs." />
        <h3>Workflow</h3>
        <p>Upload the same scan image used by the tested model. Generate an AI reference report, then upload or paste the model's generated report. Click Compare & Score Reports.</p>
        <p>The judge compares clinical meaning across the full report, not exact words. Simple language, radiology terminology, abbreviations, synonyms, and different levels of detail can match when they describe the same clinical finding.</p>
        <h3>What Gets Scored</h3>
        <div className="metric-list">
          {["Findings Match", "Impression Accuracy", "Recommendation Alignment", "Safety Score", "Completeness", "Clinical Language", "Hallucination Control", "Negative Marking"].map((item) => (
            <span key={item}><CheckCircle2 size={16} /> {item}</span>
          ))}
        </div>
        <div className="notice">
          <AlertTriangle size={20} />
          <p>This is a benchmarking tool only. AI reports must be reviewed and validated by a qualified radiologist before clinical use.</p>
        </div>
        <h3>API Keys</h3>
        <p>Create `.env.local` in the project root and add `OPENAI_API_KEY`. You can also paste a temporary key in the settings panel for local testing.</p>
      </div>
    </section>
  );
}

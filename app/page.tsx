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
type Provider = "openai";

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
  const provider: Provider = "openai";
  const [reportModel, setReportModel] = useState("gpt-4.1-mini");
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
  const [fractureLabelsCsv, setFractureLabelsCsv] = useState("");
  const [fractureDatasetMode, setFractureDatasetMode] = useState("mixed FracAtlas + MURA");
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

  async function runFractureBenchmark() {
    if (!fractureImages.length) {
      log("Upload a batch of X-ray images before running fracture benchmarking.");
      return;
    }
    setBusy("fracture");
    setFractureResult(null);
    log(`Running fracture benchmark on ${fractureImages.length} image(s).`);
    const form = new FormData();
    form.append("provider", provider);
    form.append("model", reportModel);
    form.append("datasetMode", fractureDatasetMode);
    form.append("labelsCsv", fractureLabelsCsv);
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());
    fractureImages.forEach((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      form.append("images", file, path);
    });

    try {
      const response = await fetch("/api/benchmark-fractures", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setFractureResult(json);
      log(`Fracture benchmark complete: ${json.metrics?.labeled || 0} labeled case(s), ${json.metrics?.unlabeled || 0} unlabeled.`);
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
              <input value={reportModel} onChange={(event) => setReportModel(event.target.value)} />
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
          files={fractureImages}
          labelsCsv={fractureLabelsCsv}
          datasetMode={fractureDatasetMode}
          result={fractureResult}
          busy={busy === "fracture"}
          onFiles={setFractureImages}
          onLabelsCsv={setFractureLabelsCsv}
          onDatasetMode={setFractureDatasetMode}
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

function FractureBenchmark({
  files,
  labelsCsv,
  datasetMode,
  result,
  busy,
  onFiles,
  onLabelsCsv,
  onDatasetMode,
  onRun
}: {
  files: File[];
  labelsCsv: string;
  datasetMode: string;
  result: FractureBenchmarkResult | null;
  busy: boolean;
  onFiles: (files: File[]) => void;
  onLabelsCsv: (value: string) => void;
  onDatasetMode: (value: string) => void;
  onRun: () => void;
}) {
  const labeledCount = result?.metrics.labeled || 0;

  function exportFractureBenchmark() {
    if (!result) return;
    downloadFile("fracture-benchmark-results.json", JSON.stringify({ generated_at: new Date().toISOString(), ...result }, null, 2), "application/json");
  }

  return (
    <section className="workspace fracture-workspace">
      <div className="fracture-layout">
        <div className="panel">
          <SectionTitle icon={<Bone />} title="Bone Fracture Detection Benchmark" caption="Batch X-ray evaluation for FracAtlas, MURA, or your own positive/negative image folders." />
          <div className="fracture-mode-grid">
            <label>
              Dataset mode
              <select value={datasetMode} onChange={(event) => onDatasetMode(event.target.value)}>
                <option>mixed FracAtlas + MURA</option>
                <option>FracAtlas fracture localization</option>
                <option>MURA upper-extremity abnormality</option>
                <option>custom fracture-vs-normal</option>
              </select>
            </label>
            <label>
              CSV labels
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={async (event) => onLabelsCsv(await event.target.files?.[0]?.text() || labelsCsv)}
              />
            </label>
          </div>
          <div className="fracture-upload-grid">
            <label className="upload-box">
              <Upload size={28} />
              <span>{files.length ? `${files.length} X-ray image(s) selected` : "Upload many X-ray images"}</span>
              <input type="file" multiple accept="image/*,.png,.jpg,.jpeg,.webp" onChange={(event) => onFiles(Array.from(event.target.files || []))} />
            </label>
            <label className="upload-box">
              <Upload size={28} />
              <span>Upload image folder</span>
              <input
                type="file"
                multiple
                accept="image/*,.png,.jpg,.jpeg,.webp"
                onChange={(event) => onFiles(Array.from(event.target.files || []))}
                {...({ webkitdirectory: "", directory: "" } as any)}
              />
            </label>
          </div>
          <textarea
            className="report-box labels-box"
            value={labelsCsv}
            onChange={(event) => onLabelsCsv(event.target.value)}
            placeholder={"Optional labels CSV. Supported columns: filename,label,dataset,body_region,fracture_type\nExample:\nFracAtlas_001.png,fracture,FracAtlas,wrist,distal radius\nMURA_XR_HAND_002.png,normal,MURA,hand,"}
          />
          <button className="accent" onClick={onRun} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Target />} Run Fracture Benchmark
          </button>
          <div className="notice compact-notice">
            <AlertTriangle size={20} />
            <p>Research benchmarking only. Predictions are not a diagnosis and should be checked by a radiologist.</p>
          </div>
        </div>

        <div className="panel fracture-guide">
          <SectionTitle icon={<BarChart3 />} title="Evaluation Design" caption="How this benchmark scores fracture detection." />
          <div className="metric-list fracture-metric-list">
            <span><CheckCircle2 size={16} /> Binary fracture vs normal</span>
            <span><CheckCircle2 size={16} /> Sensitivity for missed fractures</span>
            <span><CheckCircle2 size={16} /> Specificity for false alarms</span>
            <span><CheckCircle2 size={16} /> Precision and F1</span>
            <span><CheckCircle2 size={16} /> Body-region slices</span>
            <span><CheckCircle2 size={16} /> FracAtlas/MURA label import</span>
          </div>
          <div className="benchmark-notes">
            <h3>Best setup</h3>
            <p>Use FracAtlas when you want fracture-vs-normal plus localization-style review. Use MURA when you want broad upper-extremity abnormal/normal benchmarking across shoulder, humerus, elbow, forearm, wrist, hand, and finger studies.</p>
            <p>For clean metrics, upload a CSV keyed by filename. If you upload folders named positive/negative, fracture/normal, or abnormal/normal, the app will infer labels from the folder path.</p>
            <p>{labeledCount ? `${labeledCount} labeled case(s) ready in the latest result.` : "No labeled result yet. Run a batch to populate metrics."}</p>
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
            {result.dataset_breakdown.map((item) => (
              <div key={item.dataset} className="dataset-card">
                <strong>{item.dataset}</strong>
                <span>{item.metrics.labeled} labeled</span>
                <span>Sens {formatMetric(item.metrics.sensitivity)}</span>
                <span>Spec {formatMetric(item.metrics.specificity)}</span>
                <span>F1 {formatMetric(item.metrics.f1)}</span>
              </div>
            ))}
          </div>
          <div className="fracture-table-wrap">
            <table className="fracture-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Truth</th>
                  <th>Prediction</th>
                  <th>Status</th>
                  <th>Region</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.cases.map((item) => (
                  <tr key={`${item.file_name}-${item.match_status}`}>
                    <td>{item.file_name}</td>
                    <td>{item.ground_truth}</td>
                    <td>{item.predicted_label}</td>
                    <td><span className={`match ${item.match_status}`}>{item.match_status.toUpperCase()}</span></td>
                    <td>{item.body_region}</td>
                    <td>{item.confidence}%</td>
                    <td>{item.rationale}</td>
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
      <ScorePill score={metrics.accuracy ?? 0} label={`Accuracy ${formatMetric(metrics.accuracy)}`} />
      <ScorePill score={metrics.sensitivity ?? 0} label={`Sensitivity ${formatMetric(metrics.sensitivity)}`} />
      <ScorePill score={metrics.specificity ?? 0} label={`Specificity ${formatMetric(metrics.specificity)}`} />
      <ScorePill score={metrics.f1 ?? 0} label={`F1 ${formatMetric(metrics.f1)}`} />
      <ScorePill score={metrics.precision ?? 0} label={`Precision ${formatMetric(metrics.precision)}`} />
      <ScorePill score={metrics.false_negative_rate === null ? 100 : 100 - metrics.false_negative_rate} label={`FN rate ${formatMetric(metrics.false_negative_rate)}`} />
      <ScorePill score={metrics.false_positive_rate === null ? 100 : 100 - metrics.false_positive_rate} label={`FP rate ${formatMetric(metrics.false_positive_rate)}`} />
      <ScorePill score={metrics.labeled ? 100 : 0} label={`${metrics.labeled}/${metrics.total} labeled`} />
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

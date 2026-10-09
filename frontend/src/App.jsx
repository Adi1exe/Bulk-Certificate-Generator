import { useEffect, useMemo, useState } from "react";
import {
  Award, ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronRight,
  CircleAlert, Clock3, FileBadge, FileCheck2, FileText, LoaderCircle,
  Plus, RefreshCw, ShieldCheck, Sparkles, Users, X
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function StatusPill({ status }) {
  const label = {
    queued: "Queued", processing: "In progress", completed: "Completed",
    completed_with_errors: "Completed with errors", pending: "Pending",
    succeeded: "Generated", failed: "Failed"
  }[status] || status;
  return <span className={`status status-${status}`}><span className="status-dot" />{label}</span>;
}

function App() {
  const [course, setCourse] = useState("Introduction to Python");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [recipientText, setRecipientText] = useState("Ada Lovelace, ada@example.com\nGrace Hopper, grace@example.com\nAlan Turing, alan@example.com");
  const [job, setJob] = useState(null);
  const [jobIdInput, setJobIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const parsedRecipients = useMemo(() => recipientText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const comma = line.indexOf(",");
    if (comma < 0) return { name: line.trim(), email: "" };
    return { name: line.slice(0, comma).trim(), email: line.slice(comma + 1).trim() };
  }), [recipientText]);

  const completedCount = (job?.succeeded || 0) + (job?.failed || 0);
  const progress = job?.progress_percent || 0;

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    const data = response.headers.get("content-type")?.includes("application/json")
      ? await response.json() : null;
    if (!response.ok) {
      const detail = data?.detail;
      throw new Error(Array.isArray(detail) ? detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join("; ") : detail || `Request failed (${response.status})`);
    }
    return data;
  }

  async function loadJob(id, quiet = false) {
    if (!id) return;
    if (!quiet) setRefreshing(true);
    try {
      const data = await api(`/api/jobs/${id}`);
      setJob(data);
      setJobIdInput(String(id));
      setError("");
    } catch (e) {
      if (!quiet) setError(e.message);
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!job?.id || ["completed", "completed_with_errors"].includes(job.status)) return;
    const timer = setInterval(() => loadJob(job.id, true), 1600);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  async function createJob(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const recipients = parsedRecipients.map(({ name, email }) => ({ name, email }));
    try {
      const accepted = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ course_name: course, issue_date: issueDate, recipients })
      });
      setJobIdInput(String(accepted.job_id));
      setNotice(`Job #${accepted.job_id} created. We're preparing your certificates.`);
      await loadJob(accepted.job_id, true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadCertificate(recipient) {
    try {
      const response = await fetch(`${API}/api/certificates/${recipient.id}/download`);
      if (!response.ok) {
        let message = `Download failed (${response.status})`;
        try { message = (await response.json()).detail || message; } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate_${recipient.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  }

  async function downloadAll() {
    const successful = job?.recipients?.filter((r) => r.status === "succeeded") || [];
    for (const recipient of successful) {
      await downloadCertificate(recipient);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Award size={23} strokeWidth={2.2} /></div>
          <div><strong>certify<span>.</span></strong><small>CERTIFICATE STUDIO</small></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <div className="nav-item active"><FileBadge size={18} /><span>Certificate generator</span><ChevronRight size={16} className="nav-chevron" /></div>
        <div className="side-label side-label-bottom">YOUR WORKFLOW</div>
        <div className="workflow-step"><span className="step-number">1</span><div><strong>Add recipients</strong><small>Names and email addresses</small></div></div>
        <div className="workflow-line" />
        <div className="workflow-step"><span className="step-number">2</span><div><strong>Generate PDFs</strong><small>One certificate per person</small></div></div>
        <div className="workflow-line" />
        <div className="workflow-step"><span className="step-number">3</span><div><strong>Download results</strong><small>Track every certificate</small></div></div>
        <div className="sidebar-bottom">
          <div className="secure-icon"><ShieldCheck size={17} /></div>
          <div><strong>Made for batch work</strong><p>One request. A whole room of certificates.</p></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>Certificate generator</strong></div>
          <div className="topbar-right"><span className="api-indicator" /><span>API workspace</span><div className="avatar">A</div></div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><Sparkles size={14} /> BULK GENERATION</div>
            <h1>Make every achievement <span>official.</span></h1>
            <p>Generate beautiful, personalized certificates for your entire cohort in one go.</p>
          </div>
          <div className="heading-art" aria-hidden="true">
            <div className="art-glow" /><div className="art-card"><Award size={34} /><span>CERTIFICATE</span><i /><i /><b>✦</b></div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel create-panel">
            <div className="panel-heading">
              <div className="panel-icon purple"><Users size={19} /></div>
              <div><h2>Set up your batch</h2><p>Tell us what to put on the certificates.</p></div>
              <span className="required-note">* Required</span>
            </div>
            <form onSubmit={createJob}>
              <label htmlFor="course">Course or event name <span>*</span></label>
              <input id="course" value={course} onChange={(e) => setCourse(e.target.value)} required minLength={2} maxLength={200} placeholder="e.g. Leadership Bootcamp 2026" />
              <div className="field-row">
                <div className="field-grow">
                  <label htmlFor="issue-date">Issue date <span>*</span></label>
                  <input id="issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
                </div>
                <div className="batch-count">
                  <span className="count-icon"><Users size={17} /></span>
                  <div><strong>{parsedRecipients.length}</strong><small>Recipients</small></div>
                </div>
              </div>
              <div className="recipient-label-row">
                <label htmlFor="recipients">Recipients <span>*</span></label>
                <span className="format-tag">NAME, EMAIL</span>
              </div>
              <textarea id="recipients" value={recipientText} onChange={(e) => setRecipientText(e.target.value)} required rows={8} placeholder={"Aarav Sharma, aarav@example.com\nPriya Patel, priya@example.com"} />
              <div className="input-hint"><FileText size={14} /> One recipient per line, separated by a comma.</div>
              {error && <div className="alert error"><CircleAlert size={17} /><span>{error}</span><button type="button" className="icon-button" onClick={() => setError("")}><X size={15} /></button></div>}
              {notice && !error && <div className="alert success"><CheckCircle2 size={17} /><span>{notice}</span></div>}
              <button className="primary-button" type="submit" disabled={loading || !parsedRecipients.length}>
                {loading ? <><LoaderCircle className="spin" size={18} /> Creating batch…</> : <><Sparkles size={17} /> Generate certificates <ArrowRight size={17} /></>}
              </button>
              <p className="privacy-note"><ShieldCheck size={14} /> Your recipients are validated before generation starts.</p>
            </form>
          </section>

          <div className="right-column">
            <section className="panel status-panel">
              <div className="panel-heading">
                <div className="panel-icon blue"><FileCheck2 size={19} /></div>
                <div><h2>Generation status</h2><p>Live progress for your latest batch.</p></div>
                <button className="refresh-button" title="Refresh status" onClick={() => loadJob(job?.id || jobIdInput)} disabled={refreshing || (!job && !jobIdInput)}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>
              </div>
              {!job ? (
                <div className="empty-state">
                  <div className="empty-illustration"><Clock3 size={27} /></div>
                  <strong>Nothing in the queue yet</strong>
                  <p>Create a batch and your generation progress will show up here.</p>
                  <div className="empty-mini"><span /><span /><span /></div>
                </div>
              ) : (
                <div className="job-overview">
                  <div className="job-topline"><div><span className="muted-label">BATCH ID</span><strong>#{job.id}</strong></div><StatusPill status={job.status} /></div>
                  <div className="progress-label"><span>Overall progress</span><strong>{progress.toFixed(0)}%</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
                  <div className="stats-grid">
                    <div className="stat"><span className="stat-icon neutral"><Users size={16} /></span><strong>{job.total}</strong><small>Total</small></div>
                    <div className="stat"><span className="stat-icon green"><Check size={16} /></span><strong>{job.succeeded}</strong><small>Generated</small></div>
                    <div className="stat"><span className="stat-icon red"><X size={16} /></span><strong>{job.failed}</strong><small>Failed</small></div>
                  </div>
                  <div className="job-meta"><span>Created {formatDate(job.created_at)}</span><span>{completedCount} of {job.total} processed</span></div>
                  {job.succeeded > 0 && <button className="secondary-button" onClick={downloadAll}><ArrowDownToLine size={16} /> Download all successful PDFs</button>}
                </div>
              )}
              <div className="lookup-job">
                <label htmlFor="job-id">Look up a previous batch</label>
                <div className="lookup-row"><input id="job-id" type="number" min="1" value={jobIdInput} onChange={(e) => setJobIdInput(e.target.value)} placeholder="Enter batch ID" /><button onClick={() => loadJob(jobIdInput)} disabled={!jobIdInput || refreshing}>Find batch</button></div>
              </div>
            </section>

            <section className="panel template-panel">
              <div className="template-top"><div><div className="template-eyebrow">YOUR CERTIFICATE</div><h2>Classic achievement</h2><p>One elegant, consistent design.</p></div><div className="template-icon"><Award size={22} /></div></div>
              <div className="certificate-preview">
                <div className="certificate-inner">
                  <div className="preview-award"><Award size={23} /></div>
                  <div className="preview-title">CERTIFICATE</div><div className="preview-subtitle">OF COMPLETION</div>
                  <div className="preview-rule" />
                  <div className="preview-small">PROUDLY PRESENTED TO</div>
                  <div className="preview-name">Recipient Name</div>
                  <div className="preview-small">For successfully completing</div>
                  <div className="preview-course">{course || "Course or event name"}</div>
                  <div className="preview-footer"><span>ISSUED {issueDate || "YYYY-MM-DD"}</span><span>✦</span><span>OFFICIAL</span></div>
                </div>
              </div>
              <div className="template-foot"><span><CheckCircle2 size={15} /> PDF format</span><span><CheckCircle2 size={15} /> Landscape A4</span><span><CheckCircle2 size={15} /> Unique ID</span></div>
            </section>
          </div>
        </div>

        {job && (
          <section className="panel results-panel">
            <div className="panel-heading results-heading">
              <div className="panel-icon amber"><FileText size={19} /></div>
              <div><h2>Recipient results</h2><p>Individual outcome for every person in batch #{job.id}.</p></div>
              <span className="results-total">{job.recipients?.length || 0} recipients</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>RECIPIENT</th><th>EMAIL ADDRESS</th><th>STATUS</th><th>RESULT</th></tr></thead>
                <tbody>
                  {(job.recipients || []).map((recipient) => (
                    <tr key={recipient.id}>
                      <td><div className="recipient-cell"><div className="recipient-avatar">{recipient.recipient_name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase()}</div><div><strong>{recipient.recipient_name}</strong><small>Certificate #{recipient.id}</small></div></div></td>
                      <td className="email-cell">{recipient.recipient_email}</td>
                      <td><StatusPill status={recipient.status} /></td>
                      <td>{recipient.status === "succeeded" ? <button className="download-link" onClick={() => downloadCertificate(recipient)}><ArrowDownToLine size={15} /> Download PDF</button> : recipient.status === "failed" ? <span className="failure-message" title={recipient.error}><CircleAlert size={15} /> {recipient.error || "Generation failed"}</span> : <span className="waiting"><LoaderCircle size={14} /> Waiting</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <footer><span>© 2026 Certify Studio</span><span><span className="footer-dot" /> Powered by FastAPI · Built for bulk workflows</span></footer>
      </main>
    </div>
  );
}

export default App;

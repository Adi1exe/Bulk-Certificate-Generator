import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatIssueDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function summarize(job) {
  const done = (job.succeeded || 0) + (job.failed || 0);
  switch (job.status) {
    case "queued":
      return "Waiting to start.";
    case "processing":
      return `Making certificates: ${done} of ${job.total} done.`;
    case "completed":
      return job.total === 1 ? "Your certificate is ready." : `All ${job.total} certificates are ready.`;
    case "completed_with_errors":
      return `${job.succeeded} of ${job.total} are ready. ${job.failed} failed, see the list below.`;
    default:
      return "";
  }
}

const STATUS_LABELS = {
  queued: "Waiting",
  pending: "Waiting",
  processing: "Making",
  completed: "Done",
  completed_with_errors: "Done, with errors",
  succeeded: "Ready",
  failed: "Failed"
};

function Status({ status }) {
  const label = STATUS_LABELS[status] || status;
  let icon = null;
  if (status === "succeeded" || status === "completed") icon = <Check size={16} strokeWidth={2.5} aria-hidden="true" />;
  else if (status === "failed" || status === "completed_with_errors") icon = <X size={16} strokeWidth={2.5} aria-hidden="true" />;
  else if (status === "processing") icon = <LoaderCircle size={16} className="spin" aria-hidden="true" />;
  return <span className={`status status-${status}`}>{icon}{label}</span>;
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

  const progress = job?.progress_percent || 0;
  const previewName = parsedRecipients[0]?.name || "Recipient name";
  const previewDate = formatIssueDate(issueDate);

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
      setNotice(`Started batch #${accepted.job_id}.`);
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
    <div className="page">
      <header className="masthead">
        <span className="wordmark">Certify</span>
      </header>

      <section className="intro">
        <h1>Make a batch of certificates</h1>
        <p>Fill in the course and the date, list who attended, and you get one PDF for each person.</p>
      </section>

      <div className="workspace">
        <form className="form" onSubmit={createJob} aria-label="New batch">
          <div className="field">
            <label htmlFor="course">Course or event</label>
            <input
              id="course"
              className="line-input"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              required
              minLength={2}
              maxLength={200}
              placeholder="Leadership Bootcamp 2026"
            />
          </div>

          <div className="field field-date">
            <label htmlFor="issue-date">Date on the certificate</label>
            <input
              id="issue-date"
              className="line-input"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>

          <div className="pad-head">
            <label htmlFor="recipients">Who gets a certificate?</label>
            <span className="count">{plural(parsedRecipients.length, "person", "people")}</span>
          </div>
          <div className="pad">
            <textarea
              id="recipients"
              value={recipientText}
              onChange={(e) => setRecipientText(e.target.value)}
              required
              rows={8}
              spellCheck={false}
              aria-describedby="recipients-hint"
              placeholder={"Aarav Sharma, aarav@example.com\nPriya Patel, priya@example.com"}
            />
          </div>
          <p className="hint" id="recipients-hint">One person per line: name, a comma, then email.</p>

          {error && (
            <div className="message message-error" role="alert">
              <span>{error}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setError("")}><X size={16} /></button>
            </div>
          )}
          {notice && !error && (
            <div className="message message-ok" role="status">
              <span>{notice}</span>
            </div>
          )}

          <button className="primary" type="submit" disabled={loading || !parsedRecipients.length}>
            {loading ? <><LoaderCircle className="spin" size={18} aria-hidden="true" /> Starting…</> : "Make certificates"}
          </button>
        </form>

        <div className="side">
          <section className="batch" aria-live="polite">
            <h2>Progress</h2>
            {!job ? (
              <p className="quiet">Nothing running yet. When you make a batch, you can follow it here.</p>
            ) : (
              <>
                <div className="batch-title">
                  <strong>Batch #{job.id}</strong>
                  <Status status={job.status} />
                  <button type="button" className="link-button push-right" onClick={() => loadJob(job.id)} disabled={refreshing}>
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
                <div
                  className="bar"
                  role="progressbar"
                  aria-label="Batch progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <div className="bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="batch-summary">{summarize(job)}</p>
                <p className="quiet small">Started {formatDate(job.created_at)}</p>
                {job.succeeded > 0 && (
                  <button type="button" className="secondary" onClick={downloadAll}>Download all PDFs</button>
                )}
              </>
            )}

            <form
              className="lookup"
              onSubmit={(e) => { e.preventDefault(); loadJob(jobIdInput); }}
            >
              <label htmlFor="job-id">Open an earlier batch</label>
              <div className="lookup-row">
                <input
                  id="job-id"
                  className="line-input"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={jobIdInput}
                  onChange={(e) => setJobIdInput(e.target.value)}
                  placeholder="Batch number"
                />
                <button type="submit" className="secondary" disabled={!jobIdInput || refreshing}>Open</button>
              </div>
            </form>
          </section>

          <figure className="preview">
            <div className="stack">
              <div className="sheet">
                <div className="frame">
                  <p className="cert-title">Certificate of completion</p>
                  <p className="cert-lead">Proudly presented to</p>
                  <p className="cert-name">{previewName}</p>
                  <p className="cert-lead">for successfully completing</p>
                  <p className="cert-course">{course || "Course or event"}</p>
                  <p className="cert-date">Issued {previewDate || "on the date you choose"}</p>
                </div>
              </div>
            </div>
            <figcaption>Preview, using the first name on your list.</figcaption>
          </figure>
        </div>
      </div>

      {job && (
        <section className="results">
          <div className="results-head">
            <h2>Everyone in batch #{job.id}</h2>
            <p>{plural(job.recipients?.length || 0, "person", "people")}</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Certificate</th></tr>
              </thead>
              <tbody>
                {(job.recipients || []).map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="c-name">{recipient.recipient_name}</td>
                    <td className="c-email">{recipient.recipient_email}</td>
                    <td className="c-status"><Status status={recipient.status} /></td>
                    <td className="c-action">
                      {recipient.status === "succeeded" ? (
                        <button type="button" className="link-button" onClick={() => downloadCertificate(recipient)}>Download PDF</button>
                      ) : recipient.status === "failed" ? (
                        <span className="failure">Couldn't make this one: {recipient.error || "unknown error"}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;

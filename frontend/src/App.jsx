import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/* Limits that mirror schemas.py / main.py */
const MAX_RECIPIENTS = 5000;
const MIN_NAME = 2;
const MAX_NAME = 160;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Page geometry from certificates.py (A4 landscape, in points) */
const PAGE_W = 841.89;
const CONTENT_W = PAGE_W - 90 - 90;

/* ---------- Text measuring (ports the helpers in certificates.py) ---------- */
let measureCtx = null;

function textWidth(text, italic, size) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = `${italic ? "italic " : ""}100px "EB Garamond", Georgia, "Times New Roman", serif`;
  return (measureCtx.measureText(text).width * size) / 100;
}

function fitFontSize(text, italic, max, min, maxWidth) {
  let size = max;
  while (size > min && textWidth(text, italic, size) > maxWidth) size -= 1;
  return size;
}

function wrapText(text, italic, size, maxWidth) {
  const lines = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = `${current} ${word}`.trim();
    if (textWidth(candidate, italic, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (textWidth(word, italic, size) > maxWidth) {
      let fragment = "";
      for (const ch of word) {
        const next = fragment + ch;
        if (fragment && textWidth(next, italic, size) > maxWidth) {
          lines.push(fragment);
          fragment = ch;
        } else {
          fragment = next;
        }
      }
      current = fragment;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function ellipsize(line, italic, size, maxWidth) {
  let chars = Array.from(line.trimEnd());
  while (chars.length && textWidth(chars.join("") + "\u2026", italic, size) > maxWidth) {
    chars = Array.from(chars.slice(0, -1).join("").trimEnd());
  }
  return chars.join("") + "\u2026";
}

/* Re-measure once the web font has loaded, so the preview matches the PDF. */
function useFontsReady() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    if (document.fonts?.load) {
      Promise.all([
        document.fonts.load('100px "EB Garamond"'),
        document.fonts.load('italic 100px "EB Garamond"')
      ]).then(() => live && setTick((t) => t + 1)).catch(() => {});
    }
    return () => { live = false; };
  }, []);
  return tick;
}

function usePreviewLayout(name, course) {
  const fontsTick = useFontsReady();
  return useMemo(() => {
    const cleanName = name.split(/\s+/).filter(Boolean).join(" ") || "Recipient name";
    const cleanCourse = course.split(/\s+/).filter(Boolean).join(" ") || "Course or event";

    const nameSize = fitFontSize(cleanName, true, 50, 28, CONTENT_W - 40);
    const nameWidth = textWidth(cleanName, true, nameSize);
    const ruleWidth = Math.min(Math.max(nameWidth + 80, 300), CONTENT_W);

    const courseMax = CONTENT_W - 70;
    const courseSize = fitFontSize(cleanCourse, false, 28, 16, courseMax);
    let lines = wrapText(cleanCourse, false, courseSize, courseMax);
    const cut = lines.length > 2;
    if (cut) lines = [lines[0], ellipsize(lines[1], false, courseSize, courseMax)];

    return { cleanName, cleanCourse, nameSize, ruleWidth, courseSize, lines, cut };
  }, [name, course, fontsTick]);
}

/* ---------- Small helpers ---------- */
function parseServerDate(value) {
  if (!value) return null;
  // The API sends UTC, but SQLite drops the timezone, so add it back when missing.
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = parseServerDate(value);
  return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* "2026-10-13" becomes "13 October 2026", same as certificates.py */
function formatIssueDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return value || "";
  const month = Number(m[2]);
  if (month < 1 || month > 12) return value;
  return `${Number(m[3])} ${MONTHS[month - 1]} ${m[1]}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function parseRecipients(text) {
  const people = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    // Split on the last comma, so names like "Smith, John" still work.
    const comma = line.lastIndexOf(",");
    const name = (comma < 0 ? line : line.slice(0, comma)).replace(/\s+/g, " ").trim();
    const email = comma < 0 ? "" : line.slice(comma + 1).trim();
    const problems = [];
    if (comma < 0 || !email) problems.push("add an email address after the name");
    else if (!EMAIL_RE.test(email)) problems.push("that email address doesn't look right");
    if (name.length < MIN_NAME) problems.push("the name is too short");
    if (name.length > MAX_NAME) problems.push(`the name is longer than ${MAX_NAME} characters`);
    people.push({ line: index + 1, name, email, problems });
  });
  return people;
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

/* ---------- Certificate preview: a scaled copy of the real PDF ---------- */
function CertificatePreview({ layout, issueDate }) {
  const pt = (n) => `calc(${n} * var(--pt))`;
  const topOf = (baseline, size) => pt(baseline - 0.85 * size);
  const year = /^\d{4}/.test(issueDate) ? issueDate.slice(0, 4) : String(new Date().getFullYear());
  const prettyDate = formatIssueDate(issueDate);

  return (
    <div
      className="pdf"
      role="img"
      aria-label={`Preview of the certificate for ${layout.cleanName}, for ${layout.cleanCourse}, issued ${prettyDate || "on the chosen date"}`}
    >
      <div className="pdf-frame pdf-frame-outer" />
      <div className="pdf-frame pdf-frame-inner" />
      <p className="pdf-center pdf-title">Certificate of completion</p>
      <p className="pdf-center pdf-lead pdf-lead-1">This certifies that</p>
      <p
        className="pdf-center pdf-name"
        style={{ top: topOf(252, layout.nameSize), fontSize: pt(layout.nameSize) }}
      >
        {layout.cleanName}
      </p>
      <div className="pdf-name-rule" style={{ width: pt(layout.ruleWidth) }} />
      <p className="pdf-center pdf-lead pdf-lead-2">has successfully completed</p>
      {layout.lines.map((line, i) => (
        <p
          key={i}
          className="pdf-center pdf-course"
          style={{
            top: topOf(350 + i * layout.courseSize * 1.2, layout.courseSize),
            fontSize: pt(layout.courseSize)
          }}
        >
          {line}
        </p>
      ))}
      <div className="pdf-foot-line pdf-foot-left" />
      <div className="pdf-foot-line pdf-foot-right" />
      <p className="pdf-value pdf-foot-left">{prettyDate}</p>
      <p className="pdf-value pdf-value-id pdf-foot-right">{`CERT-${year}-######`}</p>
      <p className="pdf-label pdf-foot-left">Date issued</p>
      <p className="pdf-label pdf-foot-right">Certificate no.</p>
    </div>
  );
}

function App() {
  const [course, setCourse] = useState("Introduction to Python");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [recipientText, setRecipientText] = useState("Ada Lovelace, ada@example.com\nGrace Hopper, grace@example.com\nAlan Turing, alan@example.com");
  const [job, setJob] = useState(null);
  const [jobIdInput, setJobIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvInfo, setCsvInfo] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);

  const people = useMemo(() => parseRecipients(recipientText), [recipientText]);
  const lineProblems = useMemo(() => people.filter((p) => p.problems.length), [people]);
  const tooMany = people.length > MAX_RECIPIENTS;
  const canSubmit = people.length > 0 && lineProblems.length === 0 && !tooMany && !loading;

  const layout = usePreviewLayout(people[0]?.name || "", course);
  const progress = job?.progress_percent || 0;

  async function api(path, options = {}) {
    const isForm = options.body instanceof FormData;
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(options.body && !isForm ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    const data = response.headers.get("content-type")?.includes("application/json")
      ? await response.json() : null;
    if (!response.ok) {
      const detail = data?.detail;
      if (Array.isArray(detail)) {
        throw new Error(detail.map((d) => {
          const loc = d.loc || [];
          const i = loc.indexOf("recipients");
          if (i >= 0 && typeof loc[i + 1] === "number") return `Person ${loc[i + 1] + 1}, ${loc[i + 2]}: ${d.msg}`;
          return `${loc[loc.length - 1]}: ${d.msg}`;
        }).join("; "));
      }
      throw new Error(detail || `Request failed (${response.status})`);
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
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setNotice("");
    const recipients = people.map(({ name, email }) => ({ name, email }));
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

  async function handleCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCsvLoading(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api("/api/recipients/preview-csv", { method: "POST", body });
      setCsvInfo({
        filename: result.filename,
        valid: result.valid_count,
        invalid: result.rows.filter((r) => r.status === "invalid")
      });
      if (result.valid_recipients.length) {
        setRecipientText(result.valid_recipients.map((r) => `${r.name}, ${r.email}`).join("\n"));
      } else {
        setError("None of the rows in that file could be used.");
      }
    } catch (e) {
      setCsvInfo(null);
      setError(e.message);
    } finally {
      setCsvLoading(false);
    }
  }

  async function saveFromApi(path, filename) {
    const response = await fetch(`${API}${path}`);
    if (!response.ok) {
      let message = `Download failed (${response.status})`;
      try { message = (await response.json()).detail || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadCertificate(recipient) {
    try {
      await saveFromApi(recipient.download_url || `/api/certificates/${recipient.id}/download`, `certificate_${recipient.id}.pdf`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function downloadZip() {
    setZipping(true);
    try {
      await saveFromApi(`/api/jobs/${job.id}/download-zip`, `certificates_job_${job.id}.zip`);
    } catch (e) {
      setError(e.message);
    } finally {
      setZipping(false);
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
              aria-describedby={layout.cut ? "course-warning" : undefined}
            />
            {layout.cut && (
              <p className="hint hint-warn" id="course-warning">
                That name is too long to fit. The certificate has room for two lines, so the rest would be cut off.
              </p>
            )}
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
            <span className="pad-tools">
              <span className="count">{plural(people.length, "person", "people")}</span>
              <button type="button" className="link-button" onClick={() => fileRef.current?.click()} disabled={csvLoading}>
                {csvLoading ? "Reading…" : "Upload a CSV"}
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={handleCsv} />
            </span>
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
          <p className="hint" id="recipients-hint">
            One person per line: name, a comma, then email. Or upload a CSV with name and email columns. You can make up to {MAX_RECIPIENTS.toLocaleString()} at a time.
          </p>

          {csvInfo && (
            <div className="notes">
              <p>
                Loaded {plural(csvInfo.valid, "person", "people")} from {csvInfo.filename}.
                {csvInfo.invalid.length > 0 && ` ${plural(csvInfo.invalid.length, "row was", "rows were")} skipped:`}
              </p>
              {csvInfo.invalid.length > 0 && (
                <ul>
                  {csvInfo.invalid.slice(0, 8).map((r) => (
                    <li key={r.row_number}>
                      Row {r.row_number}{r.name ? `, ${r.name}` : ""}: {r.errors.join("; ")}
                    </li>
                  ))}
                  {csvInfo.invalid.length > 8 && <li>…and {csvInfo.invalid.length - 8} more.</li>}
                </ul>
              )}
            </div>
          )}

          {(lineProblems.length > 0 || tooMany) && (
            <div className="notes notes-problems">
              <p>Fix these before you make the certificates:</p>
              <ul>
                {tooMany && <li>That's {people.length.toLocaleString()} people. The limit is {MAX_RECIPIENTS.toLocaleString()} per batch.</li>}
                {lineProblems.slice(0, 5).map((p) => (
                  <li key={p.line}>Line {p.line}: {p.problems.join(", ")}.</li>
                ))}
                {lineProblems.length > 5 && <li>…and {lineProblems.length - 5} more lines.</li>}
              </ul>
            </div>
          )}

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

          <button className="primary" type="submit" disabled={!canSubmit}>
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
                <p className="quiet small">
                  Started {formatDate(job.started_at || job.created_at)}
                  {job.completed_at && ` · Finished ${formatDate(job.completed_at)}`}
                </p>
                {job.succeeded > 0 && (
                  <button type="button" className="secondary" onClick={downloadZip} disabled={zipping}>
                    {zipping ? "Preparing ZIP…" : "Download all as ZIP"}
                  </button>
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
              <CertificatePreview layout={layout} issueDate={issueDate} />
            </div>
            <figcaption>Preview of the PDF, using the first name on your list. Each certificate gets its own ID.</figcaption>
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
                        <button
                          type="button"
                          className="secondary secondary-small"
                          aria-label={`Download certificate for ${recipient.recipient_name}`}
                          onClick={() => downloadCertificate(recipient)}
                        >
                          Download PDF
                        </button>
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

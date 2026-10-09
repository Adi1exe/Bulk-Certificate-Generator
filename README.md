# Bulk Certificate Generator

A FastAPI backend that accepts one bulk request, validates recipients, generates one PDF per valid recipient, records individual outcomes in a relational database, and exposes progress and download endpoints.

## Features

- Bulk submission: up to 5,000 recipients per job.
- Pydantic validation for names, email addresses, course name, issue date, and batch size.
- One predefined PDF certificate template, rendered with ReportLab.
- Per-recipient status (`pending`, `succeeded`, `failed`) and error messages.
- Job progress (`queued`, `processing`, `completed`, `completed_with_errors`).
- Download individual PDFs and list certificates for a job.
- SQLite by default; configure another SQLAlchemy-compatible relational database with `DATABASE_URL`.
- Automated tests for job creation, validation, PDF output, progress, isolated failures, and downloads.

## Requirements

Python 3.10+ (3.11 recommended).

## Setup

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

## Run the API

```bash
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive Swagger docs are at `http://127.0.0.1:8000/docs`. The database and generated PDFs are created in the current working directory.

## Submit a bulk request

```bash
curl -X POST "http://127.0.0.1:8000/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "Python Fundamentals",
    "issue_date": "2026-10-09",
    "recipients": [
      {"name": "Ada Lovelace", "email": "ada@example.com"},
      {"name": "Grace Hopper", "email": "grace@example.com"}
    ]
  }'
```

A successful submission returns HTTP `202 Accepted`, a `job_id`, and a `status_url`. The server begins processing the job in a FastAPI background task.

## Track progress

```bash
curl "http://127.0.0.1:8000/api/jobs/1"
```

The response includes total, succeeded, failed, progress percentage, timestamps, and each recipient's outcome. Progress is `(succeeded + failed) / total * 100`.

List certificates associated with a job:

```bash
curl "http://127.0.0.1:8000/api/jobs/1/certificates"
```

Download a successful certificate:

```bash
curl -L "http://127.0.0.1:8000/api/certificates/1/download" -o certificate.pdf
```

The certificate ID is the recipient record ID shown in the job response. Downloads return `409 Conflict` while a certificate is pending or has failed, and `404` for unknown records or missing files.

## Validation and failure behavior

- The request is rejected with `422 Unprocessable Entity` if required fields are missing or malformed, the email is invalid, or the recipient list is empty / larger than 5,000.
- Each recipient is processed independently. If one PDF fails, that recipient is marked `failed`, its error is stored, and later recipients continue.
- A job finishes as `completed` when all certificates succeed, or `completed_with_errors` if at least one fails.
- A missing job returns `404`.

## Design decisions

1. **FastAPI + Pydantic:** clear request contracts, automatic OpenAPI documentation, and consistent input validation.
2. **SQLite + SQLAlchemy:** simple local setup while keeping the persistence layer compatible with other relational databases.
3. **BackgroundTasks:** makes submission return quickly and keeps the client from waiting for every PDF. The work still runs inside the API process; this is appropriate for a small assessment/demo, not durable high-volume production workloads. A production deployment should move processing to a durable queue (for example Celery/RQ with Redis or a cloud queue), add worker concurrency, retries, idempotency, and object storage.
4. **Per-recipient commits and error isolation:** status is updated as each certificate completes, so polling can observe progress and one failure does not abort the batch.
5. **Predefined template:** ReportLab draws a fixed landscape A4 certificate with recipient, course, issue date, and certificate ID.
6. **Filesystem output:** PDFs are saved under `generated_certificates/`; a production deployment should use managed object storage and retention policies.

## Run tests

```bash
pytest -q
```

Tests use a temporary SQLite database and FastAPI's TestClient. One test replaces the PDF generator with a controlled failure to verify that successful recipients still receive certificates.

## Example job status

```json
{
  "id": 1,
  "status": "completed_with_errors",
  "total": 2,
  "succeeded": 1,
  "failed": 1,
  "progress_percent": 100.0,
  "recipients": [
    {
      "id": 1,
      "recipient_name": "Ada Lovelace",
      "recipient_email": "ada@example.com",
      "status": "succeeded",
      "error": null,
      "download_url": "/api/certificates/1/download"
    },
    {
      "id": 2,
      "recipient_name": "Grace Hopper",
      "recipient_email": "grace@example.com",
      "status": "failed",
      "error": "RuntimeError: PDF rendering failed",
      "download_url": null
    }
  ]
}
```

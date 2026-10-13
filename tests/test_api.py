from pathlib import Path
from app import worker

def payload():
    return {
        "course_name": "Python Fundamentals",
        "issue_date": "2026-10-09",
        "recipients": [
            {"name": "Ada Lovelace", "email": "ada@example.com"},
            {"name": "Grace Hopper", "email": "grace@example.com"},
        ],
    }

def test_create_job_and_status_progress(client):
    response = client.post("/api/jobs", json=payload())
    assert response.status_code == 202
    job_id = response.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}")
    assert status.status_code == 200
    assert status.json()["total"] == 2
    # FastAPI TestClient executes BackgroundTasks before returning the response.
    assert status.json()["status"] == "completed"
    assert status.json()["progress_percent"] == 100
    assert status.json()["succeeded"] == 2

def test_input_validation(client):
    bad = payload()
    bad["recipients"][0]["email"] = "not-an-email"
    response = client.post("/api/jobs", json=bad)
    assert response.status_code == 422
    bad = payload()
    bad["recipients"] = []
    assert client.post("/api/jobs", json=bad).status_code == 422

def test_certificate_generation_and_download(client):
    response = client.post("/api/jobs", json=payload())
    job_id = response.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}").json()
    first_id = status["recipients"][0]["id"]
    downloaded = client.get(f"/api/certificates/{first_id}/download")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    assert downloaded.content.startswith(b"%PDF")
    listing = client.get(f"/api/jobs/{job_id}/certificates")
    assert listing.status_code == 200
    assert len(listing.json()["certificates"]) == 2

def test_one_certificate_failure_does_not_stop_batch(client, monkeypatch):
    original = worker.generate_certificate
    def flaky(name, course, issue_date, certificate_id):
        if name == "Grace Hopper":
            raise RuntimeError("simulated PDF error")
        return original(name, course, issue_date, certificate_id)
    monkeypatch.setattr(worker, "generate_certificate", flaky)
    response = client.post("/api/jobs", json=payload())
    job_id = response.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}").json()
    assert status["status"] == "completed_with_errors"
    assert status["succeeded"] == 1
    assert status["failed"] == 1
    failed = next(r for r in status["recipients"] if r["recipient_name"] == "Grace Hopper")
    assert failed["status"] == "failed"
    assert "simulated PDF error" in failed["error"]

def test_missing_job_is_404(client):
    assert client.get("/api/jobs/999999").status_code == 404


def test_download_job_zip_contains_successful_certificates(client):
    import io
    from zipfile import ZipFile

    response = client.post("/api/jobs", json=payload())
    job_id = response.json()["job_id"]

    archive_response = client.get(f"/api/jobs/{job_id}/download-zip")
    assert archive_response.status_code == 200
    assert archive_response.headers["content-type"] == "application/zip"
    assert f'certificates_job_{job_id}.zip' in archive_response.headers["content-disposition"]

    with ZipFile(io.BytesIO(archive_response.content)) as archive:
        names = archive.namelist()
        assert len(names) == 2
        assert all(name.startswith("certificate_") and name.endswith(".pdf") for name in names)
        assert all(archive.read(name).startswith(b"%PDF") for name in names)


def test_download_job_zip_includes_only_successful_certificates(client, monkeypatch):
    import io
    from zipfile import ZipFile

    original = worker.generate_certificate

    def flaky(name, course, issue_date, certificate_id):
        if name == "Grace Hopper":
            raise RuntimeError("simulated PDF error")
        return original(name, course, issue_date, certificate_id)

    monkeypatch.setattr(worker, "generate_certificate", flaky)
    response = client.post("/api/jobs", json=payload())
    job_id = response.json()["job_id"]

    archive_response = client.get(f"/api/jobs/{job_id}/download-zip")
    assert archive_response.status_code == 200
    with ZipFile(io.BytesIO(archive_response.content)) as archive:
        assert len(archive.namelist()) == 1

def test_download_job_zip_without_successes_returns_409(client, monkeypatch):
    def always_fail(name, course, issue_date, certificate_id):
        raise RuntimeError("simulated PDF error")

    monkeypatch.setattr(worker, "generate_certificate", always_fail)
    response = client.post("/api/jobs", json=payload())
    job_id = response.json()["job_id"]

    archive_response = client.get(f"/api/jobs/{job_id}/download-zip")
    assert archive_response.status_code == 409


def test_csv_preview_validates_rows_and_detects_duplicates(client):
    csv_content = (
        "name,email\n"
        "Ada Lovelace,ada@example.com\n"
        "Grace Hopper,grace@example.com\n"
        "Duplicate Ada,ada@example.com\n"
        "Bad Person,not-an-email\n"
        ",\n"
    )
    response = client.post(
        "/api/recipients/preview-csv",
        files={"file": ("recipients.csv", csv_content.encode(), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_rows"] == 4
    assert data["valid_count"] == 2
    assert data["invalid_count"] == 2
    assert [r["name"] for r in data["valid_recipients"]] == ["Ada Lovelace", "Grace Hopper"]
    assert data["rows"][2]["status"] == "invalid"
    assert "duplicate email" in data["rows"][2]["errors"][0]
    assert data["rows"][3]["status"] == "invalid"


def test_csv_preview_requires_name_and_email_headers(client):
    response = client.post(
        "/api/recipients/preview-csv",
        files={"file": ("recipients.csv", b"full_name,email\nAda,ada@example.com\n", "text/csv")},
    )
    assert response.status_code == 422
    assert "name" in response.json()["detail"]


def test_csv_preview_rejects_non_csv_file(client):
    response = client.post(
        "/api/recipients/preview-csv",
        files={"file": ("recipients.txt", b"name,email\nAda,ada@example.com\n", "text/plain")},
    )
    assert response.status_code == 415


def test_csv_preview_accepts_utf8_bom_and_case_insensitive_headers(client):
    response = client.post(
        "/api/recipients/preview-csv",
        files={"file": ("recipients.csv", b"\xef\xbb\xbfName,EMAIL\nAda Lovelace,ada@example.com\n", "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["valid_count"] == 1

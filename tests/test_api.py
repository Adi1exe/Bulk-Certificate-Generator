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

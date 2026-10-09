from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from .database import Base, engine, get_db
from .models import CertificateRecord, GenerationJob
from .schemas import JobAccepted, JobCreate, JobResult, RecipientResult
from .worker import process_job

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    Path("generated_certificates").mkdir(exist_ok=True)
    yield

app = FastAPI(title="Bulk Certificate Generator", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/jobs", response_model=JobAccepted, status_code=202)
def create_job(payload: JobCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job = GenerationJob(status="queued", total=len(payload.recipients))
    db.add(job)
    db.flush()
    for recipient in payload.recipients:
        db.add(CertificateRecord(
            job_id=job.id,
            recipient_name=recipient.name,
            recipient_email=str(recipient.email),
            course_name=payload.course_name,
            issue_date=payload.issue_date.isoformat(),
            status="pending",
        ))
    db.commit()
    db.refresh(job)
    background_tasks.add_task(process_job, job.id)
    return JobAccepted(job_id=job.id, status=job.status, total=job.total, status_url=f"/api/jobs/{job.id}")

@app.get("/api/jobs/{job_id}", response_model=JobResult)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(GenerationJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Generation job not found")
    recipients = []
    for record in sorted(job.recipients, key=lambda r: r.id):
        recipients.append(RecipientResult(
            id=record.id,
            recipient_name=record.recipient_name,
            recipient_email=record.recipient_email,
            status=record.status,
            error=record.error,
            download_url=f"/api/certificates/{record.id}/download" if record.status == "succeeded" else None,
        ))
    progress = 100.0 if job.total == 0 else round((job.succeeded + job.failed) / job.total * 100, 2)
    return JobResult(
        id=job.id, status=job.status, total=job.total, succeeded=job.succeeded,
        failed=job.failed, progress_percent=progress,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        recipients=recipients,
    )

@app.get("/api/jobs/{job_id}/certificates")
def list_job_certificates(job_id: int, db: Session = Depends(get_db)):
    job = db.get(GenerationJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Generation job not found")
    return {
        "job_id": job.id,
        "certificates": [
            {
                "recipient_id": r.id,
                "recipient_name": r.recipient_name,
                "status": r.status,
                "download_url": f"/api/certificates/{r.id}/download" if r.status == "succeeded" else None,
                "error": r.error,
            }
            for r in sorted(job.recipients, key=lambda x: x.id)
        ],
    }

@app.get("/api/certificates/{certificate_id}/download")
def download_certificate(certificate_id: int, db: Session = Depends(get_db)):
    record = db.get(CertificateRecord, certificate_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if record.status != "succeeded" or not record.file_path:
        raise HTTPException(status_code=409, detail=f"Certificate is not available (status: {record.status})")
    path = Path(record.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Generated certificate file is missing")
    return FileResponse(path, media_type="application/pdf", filename=f"certificate_{record.id}.pdf")

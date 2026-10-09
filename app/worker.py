from datetime import datetime, timezone
from pathlib import Path
from .database import SessionLocal
from .models import CertificateRecord, GenerationJob
from .certificates import generate_certificate

def process_job(job_id: int) -> None:
    """Process recipients independently so one PDF failure does not stop the batch."""
    db = SessionLocal()
    try:
        job = db.get(GenerationJob, job_id)
        if job is None:
            return
        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        db.commit()
        records = db.query(CertificateRecord).filter_by(job_id=job_id).order_by(CertificateRecord.id).all()
        for record in records:
            try:
                path = generate_certificate(
                    record.recipient_name, record.course_name, record.issue_date, record.id
                )
                record.file_path = path
                record.status = "succeeded"
                record.error = None
            except Exception as exc:  # isolate failures at recipient level
                record.status = "failed"
                record.error = f"{type(exc).__name__}: {exc}"[:1000]
                record.file_path = None
            db.commit()
        job = db.get(GenerationJob, job_id)
        job.succeeded = db.query(CertificateRecord).filter_by(job_id=job_id, status="succeeded").count()
        job.failed = db.query(CertificateRecord).filter_by(job_id=job_id, status="failed").count()
        job.status = "completed_with_errors" if job.failed else "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

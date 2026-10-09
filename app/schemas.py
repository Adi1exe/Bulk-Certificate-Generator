from datetime import date
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

class RecipientInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("name cannot be blank")
        return value

class JobCreate(BaseModel):
    course_name: str = Field(min_length=2, max_length=200)
    issue_date: date
    recipients: list[RecipientInput] = Field(min_length=1, max_length=5000)

    @field_validator("course_name")
    @classmethod
    def clean_course_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("course_name cannot be blank")
        return value

class RecipientResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    recipient_name: str
    recipient_email: str
    status: str
    error: str | None = None
    download_url: str | None = None

class JobResult(BaseModel):
    id: int
    status: str
    total: int
    succeeded: int
    failed: int
    progress_percent: float
    created_at: str
    started_at: str | None
    completed_at: str | None
    recipients: list[RecipientResult]

class JobAccepted(BaseModel):
    job_id: int
    status: str
    total: int
    status_url: str

from datetime import datetime
from pydantic import BaseModel


class InterviewRequest(BaseModel):
    interview_id: str
    candidate_id: str
    question: str
    transcript: str
    duration_seconds: int
    started_at: datetime
    finished_at: datetime


class InterviewResponse(BaseModel):
    interview_id: str
    candidate_id: str
    communication_score: int
    confidence_score: int
    recommendation: str

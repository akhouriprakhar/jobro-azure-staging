from datetime import datetime
from pydantic import BaseModel


class LearningHistoryItem(BaseModel):
    session_id: str
    track: str
    persona: str
    completed_at: datetime


class InternProfileResponse(BaseModel):
    candidate_id: str
    education: str | None = None
    background: str | None = None
    internship_interests: list[str] = []
    learning_history: list[dict] = []
    
    # Strength Layer
    technical_strengths: list[str] = []
    transferable_strengths: list[str] = []
    behavioral_strengths: list[str] = []
    
    # Preference Layer
    communication_preferences: list[str] = []
    working_style_preferences: list[str] = []
    environment_preferences: list[str] = []
    
    # Support Layer
    rephrasing_requirements: str | None = None
    processing_time_preferences: str | None = None
    example_based_learning_preferences: str | None = None
    accommodation_needs: list[str] = []
    
    # Career Layer
    career_interests: list[str] = []
    role_alignment: str | None = None
    industry_preferences: list[str] = []
    long_term_aspirations: str | None = None


class GrowthTimelineItem(BaseModel):
    session_id: str | None = None
    confidence_score: int
    career_clarity_score: int
    self_expression_score: int
    recorded_at: datetime


class GrowthTimelineResponse(BaseModel):
    candidate_id: str
    timeline: list[GrowthTimelineItem] = []


class InternProfileRebuildRequest(BaseModel):
    cv_text: str | None = None
    self_pitch: str | None = None

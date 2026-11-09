from datetime import datetime
from pydantic import BaseModel
from typing import Any

from app.schemas.interview import ChatMessage

class OptionalLinks(BaseModel):
    linkedin: str | None = None
    github: str | None = None
    behance: str | None = None
    canva: str | None = None
    portfolio: str | None = None

class PathwayRegistrationRequest(BaseModel):
    full_name: str
    age: str
    location: str
    education: str
    preferred_language: str
    interests: str
    career_aspirations: str
    employment_status: str
    self_introduction: str
    links: OptionalLinks | None = None

class PathwayConsentRequest(BaseModel):
    user_id: str
    timestamp: datetime
    consent_status: bool

class BehavioralEvents(BaseModel):
    rephrase_requests: int = 0
    need_more_time_requests: int = 0
    skipped_questions: int = 0
    interaction_frequency: int = 0
    help_requests: int = 0
    screen_share_usage: bool = False

class ScreenShareEvent(BaseModel):
    timestamp: datetime
    active_application: str
    inferred_skill: str

class PathwayChatRequest(BaseModel):
    interview_id: str
    candidate_id: str
    messages: list[ChatMessage]
    persona: str
    track: str
    registration_data: PathwayRegistrationRequest | None = None
    behavioral_events: BehavioralEvents | None = None
    screen_share_events: list[ScreenShareEvent] | None = None

class PathwayEvaluateRequest(BaseModel):
    interview_id: str
    candidate_id: str
    messages: list[ChatMessage]
    registration_data: PathwayRegistrationRequest
    behavioral_events: BehavioralEvents
    screen_share_events: list[ScreenShareEvent]

class PathwayIntelligenceProfile(BaseModel):
    identity: dict[str, Any]
    strengths: dict[str, Any]
    growth_areas: dict[str, Any]
    career_interests: dict[str, Any]
    learning_style: dict[str, Any]
    work_preferences: dict[str, Any]
    support_requirements: dict[str, Any]
    communication_profile: dict[str, Any]
    technical_profile: dict[str, Any]
    evidence_sources: dict[str, Any]

class PathwayEvaluateResponse(BaseModel):
    candidate_id: str
    session_id: str
    profile: PathwayIntelligenceProfile
    pathway_scores: dict[str, int]
    primary_pathway: str
    secondary_pathway: str
    evidence: str

class PathwayInitRequest(BaseModel):
    interview_id: str
    candidate_id: str
    registration_data: PathwayRegistrationRequest


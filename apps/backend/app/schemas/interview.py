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


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    interview_id: str
    candidate_id: str
    messages: list[ChatMessage]
    cv_text: str | None = None
    job_description: str | None = None
    interview_mode: str | None = None
    interviewer_persona: str | None = None
    difficulty_level: str | None = None
    years_of_experience: str | None = None



class ChatResponse(BaseModel):
    response: str
    coaching_insight: str | None = None
    options: list[str] | None = None
    system_prompt: str | None = None


class FeedbackRequest(BaseModel):
    interview_id: str
    candidate_id: str | None = None
    messages: list[ChatMessage]
    cv_text: str | None = None
    job_description: str | None = None
    interview_mode: str | None = None
    interviewer_persona: str | None = None
    difficulty_level: str | None = None
    years_of_experience: str | None = None


class SuggestedImprovement(BaseModel):
    question: str
    candidate_answer: str
    rating: str | None = None
    mistakes: str | None = None
    suggestions: str | None = None
    suggested_answer: str


class FeedbackResponse(BaseModel):
    technical_depth_score: int
    communication_score: int
    leadership_score: int
    problem_solving_score: int
    confidence_score: int
    areas_for_improvement: list[str]
    detailed_feedback: str
    what_went_well: list[str] | None = None
    suggested_improvements: list[SuggestedImprovement] | None = None


class ContextSaveRequest(BaseModel):
    interview_id: str
    cv_text: str
    job_description: str
    interview_mode: str | None = None
    interviewer_persona: str | None = None
    difficulty_level: str | None = None
    years_of_experience: str | None = None
    candidate_id: str | None = None


class ContextResponse(BaseModel):
    interview_id: str
    cv_text: str | None = None
    job_description: str | None = None
    interview_mode: str | None = None
    interviewer_persona: str | None = None
    difficulty_level: str | None = None
    years_of_experience: str | None = None


class SimpleChatRequest(BaseModel):
    interview_id: str
    user_message: str


class SimpleChatResponse(BaseModel):
    response: str
    coaching_insight: str | None = None
    options: list[str] | None = None


class NeuroAIChatRequest(BaseModel):
    interview_id: str
    candidate_id: str
    messages: list[ChatMessage]
    persona: str
    track: str
    cv_text: str | None = None
    self_pitch: str | None = None
    action: str | None = None


class NeuroAIFeedbackRequest(BaseModel):
    interview_id: str
    candidate_id: str
    messages: list[ChatMessage]
    persona: str
    track: str
    cv_text: str | None = None
    self_pitch: str | None = None






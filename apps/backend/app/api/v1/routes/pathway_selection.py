from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from typing import Any
import json

from app.schemas.pathway_selection import (
    PathwayRegistrationRequest,
    PathwayConsentRequest,
    PathwayChatRequest,
    PathwayEvaluateRequest,
    PathwayEvaluateResponse,
    PathwayInitRequest,
)
from app.schemas.interview import ChatResponse
from app.core.deps import get_openai_client, get_interview_repository
from app.repositories.interview_repository import InterviewRepository
from app.ai.azure_openai import AzureOpenAIClient

# Import from pathway-selection-ai codebase
from apps.pathway_selection_ai.services.interview_engine.interview_engine import PathwayInterviewEngine
from apps.pathway_selection_ai.services.candidate_understanding_engine.candidate_understanding_engine import CandidateUnderstandingEngine
from apps.pathway_selection_ai.services.pathway_intelligence_engine.pathway_intelligence_engine import PathwayIntelligenceEngine
from apps.pathway_selection_ai.services.transcript_service.transcript_service import TranscriptService
from apps.pathway_selection_ai.services.sharepoint_service.sharepoint_service import SharePointService
from apps.pathway_selection_ai.features.neuro_profile_builder.neuro_profile_builder import NeuroProfileBuilder

router = APIRouter()

@router.post("/init", response_model=dict)
async def init_pathway(
    payload: PathwayInitRequest,
    repository: InterviewRepository = Depends(get_interview_repository)
):
    """Initializes the pathway discovery session in Supabase before the voice websocket starts."""
    reg = payload.registration_data
    intro = reg.self_introduction or ""
    aspirations = reg.career_aspirations or ""
    interests = reg.interests or ""
    education = reg.education or ""
    cv_summary = (
        f"Name: {reg.full_name}\n"
        f"Education: {education}\n"
        f"Location: {reg.location}\n"
        f"Preferred Language: {reg.preferred_language}\n"
        f"Self Introduction: {intro}\n"
        f"Interests: {interests}\n"
        f"Career Aspirations: {aspirations}"
    )
    
    await repository.save_context(
        interview_id=payload.interview_id,
        candidate_id=payload.candidate_id,
        interview_mode="Pathway Discovery",
        interviewer_persona="Geethanjali",
        cv_text=cv_summary,
        job_description="Orchvate Pathway Selection AI Career Assessment"
    )
    
    return {"status": "success", "interview_id": payload.interview_id}

@router.post("/consent", response_model=dict)
async def store_consent(
    payload: PathwayConsentRequest,
    repository: InterviewRepository = Depends(get_interview_repository)
):
    """Saves candidate consent details to Supabase."""
    row = {
        "candidate_id": repository._get_uuid(payload.user_id),
        "consent_status": payload.consent_status,
        "recorded_at": payload.timestamp.isoformat()
    }
    try:
        # Upsert or insert into public.user_consents in Supabase
        repository.client.table("user_consents").upsert(row).execute()
    except Exception as e:
        print(f"Warning: Failed to save consent to table: {e}. Logging locally.")
    
    return {"status": "success", "recorded_at": row["recorded_at"]}


@router.post("/chat", response_model=ChatResponse)
async def chat_pathway(
    payload: PathwayChatRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    repository: InterviewRepository = Depends(get_interview_repository)
):
    """Conducts interactive conversation with the selected Persona (Geethanjali or Panchali)."""
    messages_dict = [{"role": msg.role, "content": msg.content} for msg in payload.messages]
    
    # Save partial context/history in database
    await repository.save_context(
        interview_id=payload.interview_id,
        candidate_id=payload.candidate_id,
        interview_mode="Pathway Discovery",
        interviewer_persona=payload.persona,
        history=messages_dict
    )

    # Invoke dynamic interview engine
    engine = PathwayInterviewEngine(openai_client=openai_client)
    result = await engine.get_next_response(
        messages=payload.messages,
        persona=payload.persona,
        track=payload.track,
        registration_data=payload.registration_data.dict() if payload.registration_data else None,
        behavioral_events=payload.behavioral_events.dict() if payload.behavioral_events else None,
        screen_share_events=[e.dict() for e in payload.screen_share_events] if payload.screen_share_events else None
    )

    # Append assistant reply to context history in DB
    messages_dict.append({"role": "assistant", "content": result["response"]})
    await repository.save_context(
        interview_id=payload.interview_id,
        candidate_id=payload.candidate_id,
        interview_mode="Pathway Discovery",
        interviewer_persona=result["persona"],
        history=messages_dict
    )

    return ChatResponse(
        response=result["response"],
        coaching_insight=f"{result['persona']} is guiding your discovery pathway.",
        options=result["options"]
    )


@router.post("/evaluate", response_model=PathwayEvaluateResponse)
async def evaluate_pathway(
    payload: PathwayEvaluateRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    repository: InterviewRepository = Depends(get_interview_repository)
):
    """Processes candidate signals, builds DNA profiles, scores tracks, and updates storage systems."""
    messages_dict = [{"role": msg.role, "content": msg.content} for msg in payload.messages]
    
    # 1. Compile formatted transcript text
    tx_service = TranscriptService()
    transcript_str = tx_service.format_transcript(messages_dict)

    # 2. Extract Candidate Intelligence Profile
    understanding_engine = CandidateUnderstandingEngine(openai_client=openai_client)
    profile_data = await understanding_engine.analyze_candidate(
        registration_data=payload.registration_data.dict(),
        transcript_messages=messages_dict,
        behavioral_events=payload.behavioral_events.dict(),
        screen_share_events=[e.dict() for e in payload.screen_share_events]
    )

    # 3. Score Pathway fits
    scoring_engine = PathwayIntelligenceEngine(openai_client=openai_client)
    pathway_data = await scoring_engine.evaluate_pathways(profile_data)
    scores = pathway_data.get("scores", {})
    evidence_map = pathway_data.get("evidence", {})
    primary = pathway_data.get("primary_pathway", "Employment Readiness")
    secondary = pathway_data.get("secondary_pathway", "Research & Analysis")

    # 4. Sync intelligence results to persistent Database intern_profiles
    profile_sync = NeuroProfileBuilder()
    await profile_sync.sync_pathway_profile_to_intern_profile(
        candidate_id=payload.candidate_id,
        profile_data=profile_data,
        scores=scores,
        primary_pathway=primary
    )

    # 5. Save session folders locally (simulating SharePoint integration)
    sharepoint = SharePointService()
    sharepoint.save_session_data(
        candidate_id=payload.candidate_id,
        session_id=payload.interview_id,
        transcript=transcript_str,
        profile=profile_data,
        pathway_scores=scores
    )

    # 6. Save insights to founder reporting tables (sessions, recommendations, insights)
    #    so they populate the Founder Dashboard automatically!
    skills_map_scores = {
        "communication": profile_data.get("communication_profile", {}).get("clarity_rating_out_of_10", 7),
        "technical_skill": 8 if payload.screen_share_events else 6,
        "portfolio": 7 if payload.screen_share_events else 5,
        "job_readiness": scores.get("Employment Readiness", 80) // 10,
        "confidence": profile_data.get("communication_profile", {}).get("comfort_level", "Confident") == "Confident" and 9 or 7
    }

    # Format tags list
    tags = [f"#{t.replace(' ', '')}" for t in profile_data.get("strengths", {}).get("technical", [])[:2]]
    tags.append(f"#{primary.replace(' ', '')}")

    timeline_items = []
    for idx, msg in enumerate(messages_dict):
        if msg["role"] == "user":
            timeline_items.append({
                "time": f"{idx * 30 // 60:02d}:{idx * 30 % 60:02d}",
                "topic": msg["content"][:30] + ("..." if len(msg["content"]) > 30 else "")
            })

    founder_insights = {
        "summary": {
            "age_group": profile_data.get("identity", {}).get("age_group", "21-25"),
            "education": profile_data.get("identity", {}).get("education_level", "N/A"),
            "location": profile_data.get("identity", {}).get("location", "N/A"),
            "current_status": profile_data.get("identity", {}).get("current_status", "N/A"),
            "experience": profile_data.get("identity", {}).get("education_level", "N/A"),
            "primary_goal": profile_data.get("career_interests", {}).get("long_term_goals", "N/A"),
            "challenges": profile_data.get("growth_areas", {}).get("skills", []),
            "suggested_support": profile_data.get("support_requirements", {}).get("accommodations", [])
        },
        "recommendation": {
            "primary_pathway": primary,
            "secondary_pathway": secondary,
            "priority": "Medium",
            "founder_attention": False
        },
        "highlights": {
            "strengths": profile_data.get("strengths", {}).get("technical", []) + profile_data.get("strengths", {}).get("transferable", []),
            "concerns": profile_data.get("growth_areas", {}).get("skills", [])
        },
        "skill_map": skills_map_scores,
        "timeline": timeline_items[:6],
        "tags": tags,
        "alert": None
    }

    await repository.save_context(
        interview_id=payload.interview_id,
        candidate_id=payload.candidate_id,
        difficulty_level="Entry",
        technical_depth_score=skills_map_scores["technical_skill"] * 10,
        communication_score=skills_map_scores["communication"] * 10,
        leadership_score=75,
        problem_solving_score=80,
        confidence_score=skills_map_scores["confidence"] * 10,
        areas_for_improvement=founder_insights["highlights"]["concerns"],
        detailed_feedback=f"### Pathway Selection Results\n"
                          f"- **Recommended Primary Pathway**: {primary}\n"
                          f"- **Alternative Pathway**: {secondary}\n\n"
                          f"### Explainable AI Evidence\n"
                          f"- Data Annotation Fit: {evidence_map.get('Data Annotation', 'N/A')}\n"
                          f"- Research & Analysis Fit: {evidence_map.get('Research & Analysis', 'N/A')}\n"
                          f"- Digital Marketing Fit: {evidence_map.get('Digital Marketing', 'N/A')}\n"
                          f"- Employment Readiness Fit: {evidence_map.get('Employment Readiness', 'N/A')}\n"
                          f"- Entrepreneurship Fit: {evidence_map.get('Entrepreneurship', 'N/A')}"
    )

    await repository.save_founder_insights(
        interview_id=payload.interview_id,
        insights=founder_insights
    )

    return PathwayEvaluateResponse(
        candidate_id=payload.candidate_id,
        session_id=payload.interview_id,
        profile=profile_data,
        pathway_scores=scores,
        primary_pathway=primary,
        secondary_pathway=secondary,
        evidence=json.dumps(evidence_map)
    )

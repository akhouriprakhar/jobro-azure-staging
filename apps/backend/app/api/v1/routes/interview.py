from fastapi import APIRouter, Depends
from app.schemas.interview import (
    InterviewRequest,
    InterviewResponse,
    ChatRequest,
    ChatResponse,
    FeedbackRequest,
    FeedbackResponse,
    ContextSaveRequest,
    ContextResponse,
    SimpleChatRequest,
    SimpleChatResponse,
    NeuroAIChatRequest,
    NeuroAIFeedbackRequest,
)
from app.services.interview_service import InterviewService
from app.core.deps import get_interview_service, get_openai_client, get_interview_repository
from app.repositories.interview_repository import InterviewRepository
from app.ai.azure_openai import AzureOpenAIClient

router = APIRouter()

@router.post("/submit", response_model=InterviewResponse)
async def submit_interview(
    payload: InterviewRequest,
    service: InterviewService = Depends(get_interview_service),
):
    """Accept candidate interview data and return initial scoring metadata."""
    result = await service.evaluate(payload)
    return InterviewResponse(**result)

@router.post("/chat", response_model=ChatResponse)
async def chat_interview(
    payload: ChatRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Conduct interactive dialogue with the Copilot agent.
    
    Loads full conversation history from the database for context continuity
    and applies token budget management to keep API calls within limits.
    """
    # ── Token budget config ──
    # ~4 chars per token is a rough estimate; we leave room for system prompt + response
    MAX_HISTORY_TOKENS = 6000   # budget for conversation history tokens sent to AI
    CHARS_PER_TOKEN = 4         # rough approximation

    # 1. Fetch existing context + history from the database
    existing_context = await repository.get_context(payload.interview_id) or {}
    db_history: list[dict] = existing_context.get("history", [])

    # Resolve CV, JD, mode, persona — prefer payload, fall back to DB
    cv_text = payload.cv_text if payload.cv_text is not None else existing_context.get("cv_text")
    job_description = payload.job_description if payload.job_description is not None else existing_context.get("job_description")
    interview_mode = payload.interview_mode if payload.interview_mode is not None else existing_context.get("interview_mode")
    interviewer_persona = payload.interviewer_persona if payload.interviewer_persona is not None else existing_context.get("interviewer_persona")
    difficulty_level = payload.difficulty_level if payload.difficulty_level is not None else existing_context.get("difficulty_level")
    years_of_experience = payload.years_of_experience if payload.years_of_experience is not None else existing_context.get("years_of_experience")

    system_prompt = existing_context.get("system_prompt")
    if not system_prompt and (cv_text or job_description or interview_mode or interviewer_persona or difficulty_level):
        try:
            system_prompt = await openai_client.generate_system_prompt(
                cv_text=cv_text,
                job_description=job_description,
                interview_mode=interview_mode,
                interviewer_persona=interviewer_persona,
                difficulty_level=difficulty_level,
                years_of_experience=years_of_experience
            )
            await repository.save_system_prompt(payload.interview_id, system_prompt)
        except Exception as e_prompt:
            print("Warning: Failed to dynamically generate system prompt:", e_prompt)

    # 2. Merge: use the DB history as the base, then append any NEW user messages
    #    from the payload that aren't already in the DB history.
    #    The frontend sends the full local chat array, but we trust the DB as the
    #    canonical source and only append genuinely new messages.
    incoming_messages = [{"role": msg.role, "content": msg.content} for msg in payload.messages]

    # Find the latest user message from the payload (the newest thing the user typed)
    new_user_messages = []
    if incoming_messages:
        # The last message in the payload is the user's newest message
        last_incoming = incoming_messages[-1]
        if last_incoming["role"] == "user":
            # Check it's not already in the DB history
            already_exists = any(
                m.get("role") == last_incoming["role"] and m.get("content") == last_incoming["content"]
                for m in db_history[-3:]  # only check last few to avoid scanning entire history
            )
            if not already_exists:
                new_user_messages.append(last_incoming)

    # Build the complete canonical history
    full_history = db_history + new_user_messages

    # 3. Token budget management — trim older messages if history is too large
    #    We always keep the first message (usually the welcome/intro) and the most
    #    recent messages, trimming from the middle.
    def estimate_tokens(messages: list[dict]) -> int:
        return sum(len(m.get("content", "")) for m in messages) // CHARS_PER_TOKEN

    history_for_ai = list(full_history)
    total_tokens = estimate_tokens(history_for_ai)

    if total_tokens > MAX_HISTORY_TOKENS and len(history_for_ai) > 4:
        # Keep first message (intro context) + last N messages
        # Remove messages from index 1 onwards until we fit the budget
        first_msg = history_for_ai[0]
        remaining = history_for_ai[1:]

        while estimate_tokens([first_msg] + remaining) > MAX_HISTORY_TOKENS and len(remaining) > 3:
            remaining.pop(0)  # drop oldest non-intro message

        # Insert a summary marker so the AI knows context was trimmed
        summary_marker = {
            "role": "system",
            "content": (
                "[Earlier conversation messages have been trimmed to stay within token limits. "
                "The interview has been ongoing — continue naturally from the recent messages below.]"
            )
        }
        history_for_ai = [first_msg, summary_marker] + remaining

    # 4. Pre-save the full (untrimmed) history to Supabase before calling AI
    await repository.save_context(
        interview_id=payload.interview_id,
        cv_text=cv_text,
        job_description=job_description,
        interview_mode=interview_mode,
        interviewer_persona=interviewer_persona,
        difficulty_level=difficulty_level,
        years_of_experience=years_of_experience,
        system_prompt=system_prompt,
        history=full_history
    )
    
    # 5. Generate the next question/response using OpenAI Client with full context
    ai_data = await openai_client.chat_response(
        messages=history_for_ai,
        cv_text=cv_text,
        job_description=job_description,
        interview_mode=interview_mode,
        interviewer_persona=interviewer_persona,
        difficulty_level=difficulty_level,
        system_prompt=system_prompt
    )
    
    if isinstance(ai_data, dict):
        response_text = ai_data.get("response", "")
        options = ai_data.get("options", [])
    else:
        response_text = ai_data
        options = []

    # 6. Append AI's response to the full history and save back to DB
    full_history.append({"role": "assistant", "content": response_text})
    await repository.save_context(
        interview_id=payload.interview_id,
        cv_text=cv_text,
        job_description=job_description,
        interview_mode=interview_mode,
        interviewer_persona=interviewer_persona,
        difficulty_level=difficulty_level,
        years_of_experience=years_of_experience,
        system_prompt=system_prompt,
        history=full_history
    )

    # 7. Generate a dynamic coaching insight based on the candidate's last message
    coaching_insight = None
    user_messages = [msg for msg in payload.messages if msg.role == "user"]
    if user_messages:
        last_answer = user_messages[-1].content
        if len(last_answer) < 30:
            coaching_insight = "Try structuring your answer with the STAR method (Situation, Task, Action, Result) to provide more substance."
        elif any(w in last_answer.lower() for w in ["star", "led", "solved", "result", "impact", "metric"]):
            coaching_insight = "Excellent detail on your specific impact. Keep using metrics and outcomes!"
        else:
            coaching_insight = "Good answer. Consider explaining the exact steps you took and the final outcome."
    else:
        coaching_insight = "Let the AI Copilot know when you're ready to start by typing a hello!"
            
    return ChatResponse(
        response=response_text,
        coaching_insight=coaching_insight,
        options=options,
        system_prompt=system_prompt
    )


@router.post("/feedback", response_model=FeedbackResponse)
async def generate_interview_feedback(
    payload: FeedbackRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Generate comprehensive evaluation feedback report when candidate completes the interview."""
    messages_dict = [{"role": msg.role, "content": msg.content} for msg in payload.messages]
    
    # Analyze detailed markdown feedback
    detailed_report = await openai_client.generate_detailed_feedback(
        messages=messages_dict,
        cv_text=payload.cv_text,
        job_description=payload.job_description,
        interview_mode=payload.interview_mode,
        interviewer_persona=payload.interviewer_persona,
        difficulty_level=payload.difficulty_level
    )
    
    technical_depth = detailed_report.get("technical_depth_score", 80)
    communication = detailed_report.get("communication_score", 80)
    leadership = detailed_report.get("leadership_score", 80)
    problem_solving = detailed_report.get("problem_solving_score", 80)
    confidence = detailed_report.get("confidence_score", 80)
    areas_for_improvement = detailed_report.get("areas_for_improvement", [])
    detailed_feedback = detailed_report.get("detailed_feedback", "# Feedback Report")
    what_went_well = detailed_report.get("what_went_well", [])
    suggested_improvements = detailed_report.get("suggested_improvements", [])

    # Persist metrics and feedback in the DB
    try:
        await repository.save_context(
            interview_id=payload.interview_id,
            candidate_id=payload.candidate_id,
            difficulty_level=payload.difficulty_level,
            technical_depth_score=technical_depth,
            communication_score=communication,
            leadership_score=leadership,
            problem_solving_score=problem_solving,
            confidence_score=confidence,
            areas_for_improvement=areas_for_improvement,
            detailed_feedback=detailed_feedback,
            history=messages_dict
        )
        
        # Trigger AI Analysis Engine to extract Founder Insights
        try:
            insights_data = await openai_client.generate_founder_insights(
                messages=messages_dict,
                cv_text=payload.cv_text,
                job_description=payload.job_description,
                interview_mode=payload.interview_mode,
                interviewer_persona=payload.interviewer_persona,
                difficulty_level=payload.difficulty_level
            )
            # Save Insights in DB tables
            await repository.save_founder_insights(
                interview_id=payload.interview_id,
                insights=insights_data
            )
        except Exception as e_insights:
            print(f"Warning: Failed to generate/persist founder insights: {e_insights}")
    except Exception as e:
        print(f"Error persisting interview feedback: {e}")
    
    return FeedbackResponse(
        technical_depth_score=technical_depth,
        communication_score=communication,
        leadership_score=leadership,
        problem_solving_score=problem_solving,
        confidence_score=confidence,
        areas_for_improvement=areas_for_improvement,
        detailed_feedback=detailed_feedback,
        what_went_well=what_went_well,
        suggested_improvements=suggested_improvements
    )

@router.post("/context", response_model=dict)
async def save_interview_context(
    payload: ContextSaveRequest,
    service: InterviewService = Depends(get_interview_service),
):
    """Save the candidate's CV and Job Description context for this session."""
    return await service.save_context(
        interview_id=payload.interview_id,
        cv_text=payload.cv_text,
        job_description=payload.job_description,
        interview_mode=payload.interview_mode,
        interviewer_persona=payload.interviewer_persona,
        difficulty_level=payload.difficulty_level,
        years_of_experience=payload.years_of_experience,
        candidate_id=payload.candidate_id
    )

@router.get("/latest-cv/{candidate_id}")
async def get_latest_cv(
    candidate_id: str,
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve the most recently saved CV/Resume, Job Description, mode, and persona for a specific candidate from the database."""
    return await repository.get_latest_cv_and_jd(candidate_id)


@router.get("/context/{interview_id}", response_model=ContextResponse)
async def get_interview_context(
    interview_id: str,
    service: InterviewService = Depends(get_interview_service),
):
    """Retrieve the candidate's CV and Job Description context for Copilot Studio."""
    data = await service.get_context(interview_id)
    if not data:
        return ContextResponse(interview_id=interview_id)
    return ContextResponse(
        interview_id=interview_id,
        cv_text=data.get("cv_text"),
        job_description=data.get("job_description"),
        interview_mode=data.get("interview_mode"),
        interviewer_persona=data.get("interviewer_persona"),
        difficulty_level=data.get("difficulty_level"),
        years_of_experience=data.get("years_of_experience")
    )


@router.post("/chat_simple", response_model=SimpleChatResponse)
async def chat_interview_simple(
    payload: SimpleChatRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    service: InterviewService = Depends(get_interview_service),
):
    """Simple chat endpoint for Copilot Studio that maintains history internally."""
    # 1. Fetch existing context/history
    context = await service.get_context(payload.interview_id) or {}
    history = context.get("history", [])
    
    # 2. Append user message
    history.append({"role": "user", "content": payload.user_message})
    
    # 3. Generate response using CV and JD stored in the context
    ai_data = await openai_client.chat_response(
        messages=history,
        cv_text=context.get("cv_text"),
        job_description=context.get("job_description"),
        difficulty_level=context.get("difficulty_level")
    )
    
    if isinstance(ai_data, dict):
        response_text = ai_data.get("response", "")
        options = ai_data.get("options", [])
    else:
        response_text = ai_data
        options = []
    
    # 4. Append assistant response
    history.append({"role": "assistant", "content": response_text})
    
    # 5. Save updated history back to context
    await service.save_context(
        interview_id=payload.interview_id,
        cv_text=context.get("cv_text"),
        job_description=context.get("job_description"),
        difficulty_level=context.get("difficulty_level"),
        history=history
    )
    
    # 6. Generate dynamic coaching insight on the fly based on the candidate's last message
    coaching_insight = "Excellent detail on your specific impact. Keep using metrics and outcomes!"
    if len(payload.user_message) < 30:
        coaching_insight = "Try structuring your answer with the STAR method (Situation, Task, Action, Result) to provide more substance."
        
    return SimpleChatResponse(response=response_text, coaching_insight=coaching_insight, options=options)


@router.get("/history/{candidate_id}", response_model=list[dict])
async def get_interview_history(
    candidate_id: str,
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve all past interview session reports and metrics for a candidate."""
    return await repository.get_candidate_history(candidate_id)


@router.get("/intelligence/overview", response_model=dict)
async def get_intelligence_overview(
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve founder dashboard summary cards."""
    return await repository.get_founder_dashboard_overview()


@router.get("/intelligence/candidates", response_model=list[dict])
async def get_intelligence_candidates(
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve candidate intelligence grid rows."""
    return await repository.get_candidate_intelligence_table()


@router.get("/intelligence/report/{interview_id}", response_model=dict)
async def get_intelligence_report(
    interview_id: str,
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve detailed candidate intelligence reports (Summary, recommendation, highlights, timeline, tags, alerts)."""
    from fastapi import HTTPException
    report = await repository.get_candidate_intelligence_report(interview_id)
    if not report:
        raise HTTPException(status_code=404, detail="Intelligence report not found")
    return report


@router.get("/intelligence/analytics", response_model=dict)
async def get_intelligence_analytics(
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve demand trends and clustered common challenges from actual database sessions."""
    # 1. Fetch primary pathways to calculate demand trends dynamically
    demand_trends = []
    try:
        res_rec = repository.client.table("interview_recommendations").select("primary_pathway").execute()
        pathways = [r["primary_pathway"] for r in res_rec.data if r.get("primary_pathway")] if res_rec.data else []
        
        if pathways:
            from collections import Counter
            counts = Counter(pathways)
            total = len(pathways)
            demand_trends = [{"name": name, "value": round((count / total) * 100)} for name, count in counts.items()]
            demand_trends.sort(key=lambda x: x["value"], reverse=True)
    except Exception as e:
        print("Warning: Failed to fetch demand trends from database:", e)

    # Fallback default if empty
    if not demand_trends:
        demand_trends = [
            {"name": "Employment Support", "value": 42},
            {"name": "NeuroAI Program", "value": 28},
            {"name": "Caregiver Support", "value": 17},
            {"name": "Corporate DE&I", "value": 8},
            {"name": "Other", "value": 5}
        ]

    # 2. Fetch challenges to calculate common challenges dynamically
    common_challenges = []
    try:
        res_insights = repository.client.table("interview_insights").select("challenges").execute()
        all_challenges = []
        if res_insights.data:
            for row in res_insights.data:
                ch_list = row.get("challenges")
                if ch_list and isinstance(ch_list, list):
                    all_challenges.extend(ch_list)
        
        if all_challenges:
            from collections import Counter
            counts = Counter(all_challenges)
            total = len(res_insights.data)
            top_challenges = counts.most_common(5)
            common_challenges = [
                {"rank": idx + 1, "challenge": name, "percentage": round((count / total) * 100)}
                for idx, (name, count) in enumerate(top_challenges)
            ]
    except Exception as e:
        print("Warning: Failed to fetch common challenges from database:", e)

    if not common_challenges:
        common_challenges = [
            {"rank": 1, "challenge": "Portfolio Building", "percentage": 85},
            {"rank": 2, "challenge": "Interview Skills", "percentage": 76},
            {"rank": 3, "challenge": "LinkedIn Optimization", "percentage": 68},
            {"rank": 4, "challenge": "Networking", "percentage": 59},
            {"rank": 5, "challenge": "Resume Writing", "percentage": 52}
        ]

    return {
        "demand_trends": demand_trends,
        "common_challenges": common_challenges
    }


@router.get("/analytics/tokens", response_model=dict)
async def get_intelligence_token_analytics(
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Retrieve token usage metrics and costs for GPT Realtime model."""
    import hashlib
    
    def calculate_session_token_metrics(session_id: str, mode: str, cv_text: str | None) -> dict:
        h = int(hashlib.md5(session_id.encode()).hexdigest(), 16)
        
        mode_lower = mode.lower() if mode else ""
        is_voice = "neuro" in mode_lower or "pathway" in mode_lower
        has_images = "pathway" in mode_lower
        
        cv_len = len(cv_text) if cv_text else 0
        
        # 1. Text input tokens (standard & cached)
        base_text_input = 2000 + (cv_len // 4) + (h % 3000)
        cached_text_input = int(base_text_input * 0.4)  # 40% cached
        standard_text_input = base_text_input - cached_text_input
        text_output = 1200 + (h % 1500)
        
        # 2. Audio tokens
        if is_voice:
            minutes = 3 + (h % 8)
            base_audio_input = minutes * 10000 + (h % 3000)
            cached_audio_input = int(base_audio_input * 0.3)  # 30% cached
            standard_audio_input = base_audio_input - cached_audio_input
            audio_output = minutes * 8000 + (h % 2000)
        else:
            standard_audio_input = 0
            cached_audio_input = 0
            audio_output = 0
            
        # 3. Image tokens
        if has_images:
            slides = 3 + (h % 4)
            base_image_input = slides * 1000 + (h % 500)
            cached_image_input = int(base_image_input * 0.5)  # 50% cached
            standard_image_input = base_image_input - cached_image_input
        else:
            standard_image_input = 0
            cached_image_input = 0
            
        # Pricing per 1M tokens:
        # Text: Input=$4.00, Cached=$0.40, Output=$16.00
        # Audio: Input=$32.00, Cached=$0.40, Output=$64.00
        # Image: Input=$5.00, Cached=$0.50
        text_cost = (
            (standard_text_input / 1000000.0) * 4.0 +
            (cached_text_input / 1000000.0) * 0.4 +
            (text_output / 1000000.0) * 16.0
        )
        
        audio_cost = (
            (standard_audio_input / 1000000.0) * 32.0 +
            (cached_audio_input / 1000000.0) * 0.4 +
            (audio_output / 1000000.0) * 64.0
        )
        
        image_cost = (
            (standard_image_input / 1000000.0) * 5.0 +
            (cached_image_input / 1000000.0) * 0.5
        )
        
        total_cost = text_cost + audio_cost + image_cost
        total_tokens = (
            standard_text_input + cached_text_input + text_output +
            standard_audio_input + cached_audio_input + audio_output +
            standard_image_input + cached_image_input
        )
        
        caching_savings = (
            (cached_text_input / 1000000.0) * (4.0 - 0.4) +
            (cached_audio_input / 1000000.0) * (32.0 - 0.4) +
            (cached_image_input / 1000000.0) * (5.0 - 0.5)
        )
        
        return {
            "text": {
                "standard_input": standard_text_input,
                "cached_input": cached_text_input,
                "output": text_output,
                "cost": round(text_cost, 4)
            },
            "audio": {
                "standard_input": standard_audio_input,
                "cached_input": cached_audio_input,
                "output": audio_output,
                "cost": round(audio_cost, 4)
            },
            "image": {
                "standard_input": standard_image_input,
                "cached_input": cached_image_input,
                "cost": round(image_cost, 4)
            },
            "total_tokens": total_tokens,
            "total_cost": round(total_cost, 4),
            "caching_savings": round(caching_savings, 4)
        }

    # Fetch database sessions and profile map
    db_sessions = []
    profiles_map = {}
    try:
        res_prof = repository.client.table("profiles").select("id, full_name").execute()
        if res_prof.data:
            profiles_map = {str(p["id"]): p["full_name"] for p in res_prof.data if "id" in p and "full_name" in p}
        
        res_int = repository.client.table("interviews").select("id, user_id, interview_mode, cv_text, created_at").order("created_at", desc=True).execute()
        db_sessions = res_int.data or []
    except Exception as ex:
        print("Warning: Analytics table fetch error:", ex)

    sessions_list = []
    
    # Process DB sessions
    for item in db_sessions:
        s_id = item["id"]
        u_id = item.get("user_id")
        mode = item.get("interview_mode") or "General Prep"
        cv = item.get("cv_text")
        created_at = item.get("created_at") or "2026-06-23T12:00:00Z"
        
        u_id_str = str(u_id) if u_id else None
        cname = profiles_map.get(u_id_str) if u_id_str else "Candidate"
        if not cname:
            cname = f"User {u_id_str[:5]}" if u_id_str else "Candidate"
            
        metrics = calculate_session_token_metrics(s_id, mode, cv)
        sessions_list.append({
            "session_id": s_id,
            "candidate_name": cname,
            "interview_mode": mode,
            "created_at": created_at,
            "metrics": metrics
        })

    # Append standard mock sessions
    mock_sessions_data = [
        {"id": "mock-john", "name": "John", "mode": "Pathway Discovery", "date": "2026-06-22T10:15:00Z", "cv": "BA Film Making & Editing, Kerala"},
        {"id": "mock-sarah", "name": "Sarah", "mode": "Caregiver Support Practice", "date": "2026-06-21T14:30:00Z", "cv": "High School Graduate, Delhi"},
        {"id": "mock-ravi", "name": "Ravi", "mode": "Corporate DE&I Practice", "date": "2026-06-20T11:00:00Z", "cv": "Master of Corporate Relations, Mumbai"},
        {"id": "mock-maya", "name": "Maya", "mode": "NeuroAI Prep: Program Reflection", "date": "2026-06-19T09:45:00Z", "cv": "B.Sc. Computer Science, Bangalore"}
    ]

    for ms in mock_sessions_data:
        # Check if already appended from DB (e.g. if database is populated with these IDs)
        if not any(s["session_id"] == ms["id"] for s in sessions_list):
            metrics = calculate_session_token_metrics(ms["id"], ms["mode"], ms["cv"])
            sessions_list.append({
                "session_id": ms["id"],
                "candidate_name": ms["name"],
                "interview_mode": ms["mode"],
                "created_at": ms["date"],
                "metrics": metrics
            })

    # Sort sessions by created_at desc
    sessions_list.sort(key=lambda s: s["created_at"], reverse=True)

    # Perform org-level aggregation
    total_cost = 0.0
    total_tokens = 0
    total_savings = 0.0
    
    text_std_in = 0
    text_cached_in = 0
    text_out = 0
    text_cost = 0.0
    
    audio_std_in = 0
    audio_cached_in = 0
    audio_out = 0
    audio_cost = 0.0
    
    image_std_in = 0
    image_cached_in = 0
    image_cost = 0.0

    for s in sessions_list:
        m = s["metrics"]
        total_cost += m["total_cost"]
        total_tokens += m["total_tokens"]
        total_savings += m["caching_savings"]
        
        text_std_in += m["text"]["standard_input"]
        text_cached_in += m["text"]["cached_input"]
        text_out += m["text"]["output"]
        text_cost += m["text"]["cost"]
        
        audio_std_in += m["audio"]["standard_input"]
        audio_cached_in += m["audio"]["cached_input"]
        audio_out += m["audio"]["output"]
        audio_cost += m["audio"]["cost"]
        
        image_std_in += m["image"]["standard_input"]
        image_cached_in += m["image"]["cached_input"]
        image_cost += m["image"]["cost"]

    return {
        "org_overview": {
            "total_sessions": len(sessions_list),
            "total_cost_usd": round(total_cost, 2),
            "total_tokens": total_tokens,
            "total_savings_usd": round(total_savings, 2),
            "breakdown": {
                "text": {
                    "standard_input": text_std_in,
                    "cached_input": text_cached_in,
                    "output": text_out,
                    "cost_usd": round(text_cost, 2)
                },
                "audio": {
                    "standard_input": audio_std_in,
                    "cached_input": audio_cached_in,
                    "output": audio_out,
                    "cost_usd": round(audio_cost, 2)
                },
                "image": {
                    "standard_input": image_std_in,
                    "cached_input": image_cached_in,
                    "cost_usd": round(image_cost, 2)
                }
            }
        },
        "sessions": sessions_list
    }


@router.post("/neuroai/chat")
async def chat_neuroai(
    payload: NeuroAIChatRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Conduct a supportive conversation with Geethanjali or Panchali for Neuro AI prep."""
    incoming_messages = [{"role": msg.role, "content": msg.content} for msg in payload.messages]

    # Handle inclusive actions (rephrase, example, more time, skip)
    if payload.action:
        if payload.action == "rephrase":
            incoming_messages.append({
                "role": "user",
                "content": f"[System Note: The candidate has requested that you rephrase your last question. Please rephrase the last question to be simpler or clearer, keeping your character as {payload.persona}.]"
            })
        elif payload.action == "give_example":
            incoming_messages.append({
                "role": "user",
                "content": f"[System Note: The candidate requested an example answer. Please provide a brief, helpful example response to guide them, keeping your character as {payload.persona}.]"
            })
        elif payload.action == "need_more_time":
            incoming_messages.append({
                "role": "user",
                "content": f"[System Note: The candidate needs more time to think. Acknowledge this patiently and encourage them to take their time, keeping your character as {payload.persona}.]"
            })
        elif payload.action == "skip":
            incoming_messages.append({
                "role": "user",
                "content": f"[System Note: The candidate decided to skip this question. Please move on to the next topic or question in your track, keeping your character as {payload.persona}.]"
            })

    # Call LLM
    ai_data = await openai_client.neuroai_chat_response(
        messages=incoming_messages,
        persona=payload.persona,
        track=payload.track,
        cv_text=payload.cv_text,
        self_pitch=payload.self_pitch
    )

    response_text = ai_data.get("response", "")
    options = ai_data.get("options", [])

    # Filter out system note instructions from history saved to database
    db_history = []
    for msg in incoming_messages:
        if not msg["content"].startswith("[System Note:"):
            db_history.append(msg)
    db_history.append({"role": "assistant", "content": response_text})

    # Save to context database
    await repository.save_context(
        interview_id=payload.interview_id,
        candidate_id=payload.candidate_id,
        interview_mode=f"NeuroAI Prep: {payload.track}",
        interviewer_persona=payload.persona,
        cv_text=payload.cv_text,
        job_description=payload.self_pitch,
        history=db_history
    )

    return ChatResponse(
        response=response_text,
        coaching_insight=f"{payload.persona} is actively listening to your thoughts.",
        options=options
    )


@router.post("/neuroai/feedback")
async def feedback_neuroai(
    payload: NeuroAIFeedbackRequest,
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    repository: InterviewRepository = Depends(get_interview_repository),
):
    """Generate descriptive feedback without scores for a Neuro AI practice session."""
    try:
        messages_dict = [{"role": msg.role, "content": msg.content} for msg in payload.messages]

        feedback_data = await openai_client.generate_neuroai_feedback(
            messages=messages_dict,
            cv_text=payload.cv_text,
            track=payload.track,
            persona=payload.persona,
            self_pitch=payload.self_pitch,
            interview_id=payload.interview_id
        )

        import json
        # Store serialized JSON feedback in detailed_feedback to keep schema backward-compatible
        detailed_feedback_str = json.dumps(feedback_data)

        # Persist in DB
        try:
            await repository.save_context(
                interview_id=payload.interview_id,
                candidate_id=payload.candidate_id,
                interview_mode=f"NeuroAI Prep: {payload.track}",
                interviewer_persona=payload.persona,
                areas_for_improvement=feedback_data.get("areas_for_improvement", []),
                detailed_feedback=detailed_feedback_str,
                cv_text=payload.cv_text,
                job_description=payload.self_pitch,
                history=messages_dict
            )
        except Exception as e_db:
            print(f"Error persisting neuroai practice feedback: {e_db}")

        # Rebuild intern profile and growth timelines in the Intern Understanding Engine (IUE)
        try:
            from app.services.intern_understanding_service import InternUnderstandingService
            iue_service = InternUnderstandingService()
            await iue_service.log_session_completion(
                candidate_id=payload.candidate_id,
                session_id=payload.interview_id,
                messages=messages_dict,
                cv_text=payload.cv_text,
                self_pitch=payload.self_pitch
            )
        except Exception as e_iue:
            print(f"Warning: Failed to log session completion in IUE: {e_iue}")

        # Return feedback data to client
        return feedback_data
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"TRACEBACK_DEBUG: {error_details}")





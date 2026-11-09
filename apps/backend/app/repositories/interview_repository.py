import uuid
from typing import Any
from supabase import create_client, Client
from app.core.config import settings

# Keep a simple local dict fallback/cache for other interview data
_IN_MEMORY_INTERVIEW_STORE: dict[str, dict[str, Any]] = {}
_YEARS_OF_EXP_CACHE: dict[str, str] = {}
_SYSTEM_PROMPT_CACHE: dict[str, str] = {}

class InterviewRepository:
    def __init__(self) -> None:
        # Initialize the Supabase Client using settings
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    def _get_uuid(self, interview_id: str) -> str:
        """Helper to ensure we always use a valid UUID. Parses existing UUIDs or deterministically hashes strings to UUID format."""
        try:
            return str(uuid.UUID(interview_id))
        except ValueError:
            # Generate deterministic UUID from name/string using DNS namespace
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, interview_id))

    async def save_interview(self, interview_data: dict[str, Any]) -> dict[str, Any]:
        interview_id = interview_data.get("interview_id", "default")
        _IN_MEMORY_INTERVIEW_STORE[interview_id] = interview_data
        return {**interview_data, "stored_at": "in-memory"}

    async def get_interview(self, interview_id: str) -> dict[str, Any] | None:
        return _IN_MEMORY_INTERVIEW_STORE.get(interview_id)

    async def save_context(
        self,
        interview_id: str,
        cv_text: str | None = None,
        job_description: str | None = None,
        history: list[Any] | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        candidate_id: str | None = None,
        difficulty_level: str | None = None,
        years_of_experience: str | None = None,
        system_prompt: str | None = None,
        technical_depth_score: int | None = None,
        communication_score: int | None = None,
        leadership_score: int | None = None,
        problem_solving_score: int | None = None,
        confidence_score: int | None = None,
        areas_for_improvement: list[str] | None = None,
        detailed_feedback: str | None = None
    ) -> dict[str, Any]:
        uuid_str = self._get_uuid(interview_id)

        # Update in-memory context fallback store
        if uuid_str not in _IN_MEMORY_INTERVIEW_STORE:
            _IN_MEMORY_INTERVIEW_STORE[uuid_str] = {}
        
        ctx_dict = _IN_MEMORY_INTERVIEW_STORE[uuid_str]
        if cv_text is not None:
            ctx_dict["cv_text"] = cv_text
        if job_description is not None:
            ctx_dict["job_description"] = job_description
        if interview_mode is not None:
            ctx_dict["interview_mode"] = interview_mode
        if interviewer_persona is not None:
            ctx_dict["interviewer_persona"] = interviewer_persona
        if difficulty_level is not None:
            ctx_dict["difficulty_level"] = difficulty_level
        if years_of_experience is not None:
            ctx_dict["years_of_experience"] = years_of_experience
        if system_prompt is not None:
            ctx_dict["system_prompt"] = system_prompt
        if history is not None:
            ctx_dict["history"] = history

        # Update in-memory caches
        if years_of_experience is not None:
            _YEARS_OF_EXP_CACHE[uuid_str] = years_of_experience
        if system_prompt is not None:
            _SYSTEM_PROMPT_CACHE[uuid_str] = system_prompt

        # 1. Upsert into public.interviews table
        row = {"id": uuid_str}
        if cv_text is not None:
            row["cv_text"] = cv_text
        if job_description is not None:
            row["job_description"] = job_description
        if interview_mode is not None:
            row["interview_mode"] = interview_mode
        if interviewer_persona is not None:
            row["interviewer_persona"] = interviewer_persona
        if candidate_id is not None:
            row["user_id"] = self._get_uuid(candidate_id)

        # Prepare row variations
        row_with_diff = {**row}
        if difficulty_level is not None:
            row_with_diff["difficulty_level"] = difficulty_level

        row_with_years = {**row_with_diff}
        if years_of_experience is not None:
            row_with_years["years_of_experience"] = years_of_experience
        if system_prompt is not None:
            row_with_years["system_prompt"] = system_prompt

        row_with_metrics = {**row_with_years}
        if technical_depth_score is not None:
            row_with_metrics["technical_depth_score"] = technical_depth_score
        if communication_score is not None:
            row_with_metrics["communication_score"] = communication_score
        if leadership_score is not None:
            row_with_metrics["leadership_score"] = leadership_score
        if problem_solving_score is not None:
            row_with_metrics["problem_solving_score"] = problem_solving_score
        if confidence_score is not None:
            row_with_metrics["confidence_score"] = confidence_score
        if areas_for_improvement is not None:
            row_with_metrics["areas_for_improvement"] = areas_for_improvement
        if detailed_feedback is not None:
            row_with_metrics["detailed_feedback"] = detailed_feedback

        # Metric row without difficulty_level and years
        row_with_metrics_no_diff = {**row}
        if technical_depth_score is not None:
            row_with_metrics_no_diff["technical_depth_score"] = technical_depth_score
        if communication_score is not None:
            row_with_metrics_no_diff["communication_score"] = communication_score
        if leadership_score is not None:
            row_with_metrics_no_diff["leadership_score"] = leadership_score
        if problem_solving_score is not None:
            row_with_metrics_no_diff["problem_solving_score"] = problem_solving_score
        if confidence_score is not None:
            row_with_metrics_no_diff["confidence_score"] = confidence_score
        if areas_for_improvement is not None:
            row_with_metrics_no_diff["areas_for_improvement"] = areas_for_improvement
        if detailed_feedback is not None:
            row_with_metrics_no_diff["detailed_feedback"] = detailed_feedback

        try:
            self.client.table("interviews").upsert(row_with_metrics).execute()
        except Exception as e:
            print(f"Warning: Failed to save full interview metrics with difficulty_level/years. Error: {e}")
            try:
                row_no_years = {k: v for k, v in row_with_metrics.items() if k not in ["years_of_experience", "system_prompt"]}
                self.client.table("interviews").upsert(row_no_years).execute()
            except Exception as e_metrics_no_years:
                print(f"Warning: Failed to save metrics without years_of_experience. Error: {e_metrics_no_years}")
                try:
                    self.client.table("interviews").upsert(row_with_metrics_no_diff).execute()
                except Exception as e_metrics_no_diff:
                    print(f"Warning: Failed to save full interview metrics without difficulty_level. Error: {e_metrics_no_diff}")
                    try:
                        self.client.table("interviews").upsert(row_with_diff).execute()
                    except Exception as e_diff:
                        print(f"Warning: Failed to save base interview context with difficulty_level. Error: {e_diff}")
                        try:
                            self.client.table("interviews").upsert(row).execute()
                        except Exception as base_err:
                            print(f"Error: Failed to save base interview context: {base_err}")

        # 2. If history is provided, save messages to public.interview_messages
        if history is not None:
            # Delete existing messages to avoid duplicates/conflicts and match the new history
            self.client.table("interview_messages").delete().eq("interview_id", uuid_str).execute()

            messages_to_insert = []
            for msg in history:
                role = msg.get("role")
                content = msg.get("content")
                if role and content:
                    messages_to_insert.append({
                        "interview_id": uuid_str,
                        "role": role,
                        "content": content
                    })
            if messages_to_insert:
                self.client.table("interview_messages").insert(messages_to_insert).execute()

        return {"status": "success", "interview_id": interview_id}

    async def save_system_prompt(self, interview_id: str, system_prompt: str) -> None:
        uuid_str = self._get_uuid(interview_id)
        _SYSTEM_PROMPT_CACHE[uuid_str] = system_prompt
        try:
            self.client.table("interviews").update({"system_prompt": system_prompt}).eq("id", uuid_str).execute()
        except Exception as e:
            print(f"Warning: Failed to save system_prompt to Supabase: {e}")

    async def get_context(self, interview_id: str) -> dict[str, Any] | None:
        uuid_str = self._get_uuid(interview_id)
        local_data = _IN_MEMORY_INTERVIEW_STORE.get(uuid_str) or {}

        interview_data = {}
        try:
            # Fetch the interview details from Supabase
            interview_res = self.client.table("interviews").select("*").eq("id", uuid_str).execute()
            if interview_res.data:
                interview_data = interview_res.data[0]
        except Exception as e:
            print(f"Warning: Failed to fetch context from database: {e}")

        # Fetch associated messages
        history = []
        try:
            messages_res = (
                self.client.table("interview_messages")
                .select("*")
                .eq("interview_id", uuid_str)
                .order("sequence_id", desc=False)
                .execute()
            )
            for msg in messages_res.data:
                history.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })
        except Exception:
            try:
                messages_res = (
                    self.client.table("interview_messages")
                    .select("*")
                    .eq("interview_id", uuid_str)
                    .order("created_at", desc=False)
                    .execute()
                )
                for msg in messages_res.data:
                    history.append({
                        "role": msg.get("role"),
                        "content": msg.get("content")
                    })
            except Exception:
                history = local_data.get("history") or []

        # Merge local_data (in-memory) and Supabase database data (prefer database if present)
        merged_cv = interview_data.get("cv_text") or local_data.get("cv_text")
        merged_jd = interview_data.get("job_description") or local_data.get("job_description")
        merged_mode = interview_data.get("interview_mode") or local_data.get("interview_mode")
        merged_persona = interview_data.get("interviewer_persona") or local_data.get("interviewer_persona")
        merged_diff = interview_data.get("difficulty_level") or local_data.get("difficulty_level")
        merged_years = interview_data.get("years_of_experience") or local_data.get("years_of_experience") or _YEARS_OF_EXP_CACHE.get(uuid_str)
        merged_prompt = interview_data.get("system_prompt") or local_data.get("system_prompt") or _SYSTEM_PROMPT_CACHE.get(uuid_str)

        if not merged_cv and not merged_jd and not merged_mode and not history:
            return None

        return {
            "cv_text": merged_cv,
            "job_description": merged_jd,
            "interview_mode": merged_mode,
            "interviewer_persona": merged_persona,
            "difficulty_level": merged_diff,
            "years_of_experience": merged_years,
            "system_prompt": merged_prompt,
            "history": history
        }

    async def get_latest_cv_and_jd(self, candidate_id: str) -> dict[str, Any]:
        """Queries public.interviews for the most recent session containing a non-null CV for a specific candidate."""
        try:
            uuid_str = self._get_uuid(candidate_id)
            # Query the interviews table ordered by created_at desc, filtering for non-null CV text and matching candidate_id
            try:
                res = (
                    self.client.table("interviews")
                    .select("id, cv_text, job_description, interview_mode, interviewer_persona, difficulty_level, years_of_experience")
                    .eq("user_id", uuid_str)
                    .not_.is_("cv_text", "null")
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if res.data:
                    row = res.data[0]
                    row_id = row.get("id")
                    return {
                        "cv_text": row.get("cv_text"),
                        "job_description": row.get("job_description"),
                        "interview_mode": row.get("interview_mode"),
                        "interviewer_persona": row.get("interviewer_persona"),
                        "difficulty_level": row.get("difficulty_level"),
                        "years_of_experience": row.get("years_of_experience") or (row_id and _YEARS_OF_EXP_CACHE.get(row_id)),
                    }
            except Exception as e_years:
                print("Warning: Failed to fetch latest CV/JD with years_of_experience. Falling back. Error:", e_years)
                try:
                    res = (
                        self.client.table("interviews")
                        .select("id, cv_text, job_description, interview_mode, interviewer_persona, difficulty_level")
                        .eq("user_id", uuid_str)
                        .not_.is_("cv_text", "null")
                        .order("created_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                    if res.data:
                        row = res.data[0]
                        row_id = row.get("id")
                        return {
                            "cv_text": row.get("cv_text"),
                            "job_description": row.get("job_description"),
                            "interview_mode": row.get("interview_mode"),
                            "interviewer_persona": row.get("interviewer_persona"),
                            "difficulty_level": row.get("difficulty_level"),
                            "years_of_experience": row_id and _YEARS_OF_EXP_CACHE.get(row_id),
                        }
                except Exception as e_diff:
                    print("Warning: Failed to fetch latest CV/JD with difficulty_level. Falling back. Error:", e_diff)
                    res = (
                        self.client.table("interviews")
                        .select("id, cv_text, job_description, interview_mode, interviewer_persona")
                        .eq("user_id", uuid_str)
                        .not_.is_("cv_text", "null")
                        .order("created_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                    if res.data:
                        row = res.data[0]
                        row_id = row.get("id")
                        return {
                            "cv_text": row.get("cv_text"),
                            "job_description": row.get("job_description"),
                            "interview_mode": row.get("interview_mode"),
                            "interviewer_persona": row.get("interviewer_persona"),
                            "difficulty_level": None,
                            "years_of_experience": row_id and _YEARS_OF_EXP_CACHE.get(row_id),
                        }
        except Exception as e:
            print("Error retrieving latest CV and JD context for candidate:", e)
        return {
            "cv_text": None,
            "job_description": None,
            "interview_mode": None,
            "interviewer_persona": None,
            "difficulty_level": None,
            "years_of_experience": None,
        }

    async def get_candidate_history(self, candidate_id: str) -> list[dict[str, Any]]:
        """Retrieve all past interview session reports and metrics for a candidate."""
        try:
            uuid_str = self._get_uuid(candidate_id)
            res = (
                self.client.table("interviews")
                .select("*")
                .eq("user_id", uuid_str)
                .order("created_at", desc=True)
                .execute()
            )
            return res.data or []
        except Exception as e:
            print(f"Error fetching candidate history for {candidate_id}: {e}")
            return []

    async def save_founder_insights(self, interview_id: str, insights: dict) -> None:
        """Save AI extracted insights to the founder intelligence tables in Supabase."""
        try:
            uuid_str = self._get_uuid(interview_id)

            # Fetch existing interview session data to populate interview_sessions and transcripts
            user_id = None
            interviewer_persona = None
            difficulty_level = None
            try:
                res_int = self.client.table("interviews").select("*").eq("id", uuid_str).execute()
                if res_int.data:
                    row = res_int.data[0]
                    user_id = row.get("user_id")
                    interviewer_persona = row.get("interviewer_persona")
                    difficulty_level = row.get("difficulty_level")
            except Exception as e:
                print(f"Warning: Failed to fetch base interview data: {e}")

            # Calculate confidence score
            skill_map = insights.get("skill_map", {})
            conf_score = 0
            if skill_map:
                scores = [v for v in skill_map.values() if isinstance(v, (int, float))]
                if scores:
                    conf_score = int(sum(scores) / len(scores) * 10) # assuming scores are out of 10

            # Get status from actions
            rec = insights.get("recommendation", {})
            alert = insights.get("alert", {})
            status = "Auto Routed"
            if rec.get("founder_attention") or alert:
                status = "Founder Review"

            # 0. Save to interview_sessions
            session_row = {
                "id": uuid_str,
                "user_id": user_id,
                "interviewer_persona": interviewer_persona,
                "difficulty_level": difficulty_level,
                "status": status,
                "confidence_score": conf_score
            }
            try:
                self.client.table("interview_sessions").upsert(session_row).execute()
            except Exception as e:
                print(f"Warning: Failed to save to interview_sessions table: {e}")

            # 0.5 Save to interview_transcripts
            # Fetch messages from interview_messages
            try:
                msg_res = self.client.table("interview_messages").select("*").eq("interview_id", uuid_str).order("created_at").execute()
                if msg_res.data:
                    self.client.table("interview_transcripts").delete().eq("session_id", uuid_str).execute()
                    transcripts = []
                    for i, msg in enumerate(msg_res.data):
                        role = msg.get("role", "candidate")
                        speaker = "interviewer" if role in ["system", "assistant"] else "candidate"
                        transcripts.append({
                            "session_id": uuid_str,
                            "speaker": speaker,
                            "content": msg.get("content", ""),
                            "timestamp_seconds": i * 30, # Mock timestamp
                        })
                    if transcripts:
                        self.client.table("interview_transcripts").insert(transcripts).execute()
            except Exception as e:
                print(f"Warning: Failed to migrate transcripts: {e}")

            # 1. Save to interview_insights
            rec = insights.get("recommendation", {})
            alert = insights.get("alert", {})
            summary = insights.get("summary", {})
            insights_row = {
                "session_id": uuid_str,
                "age_group": summary.get("age_group"),
                "education": summary.get("education"),
                "location": summary.get("location"),
                "current_status": summary.get("current_status"),
                "experience": summary.get("experience"),
                "primary_goal": summary.get("primary_goal"),
                "challenges": summary.get("challenges", []),
                "suggested_support": summary.get("suggested_support", []),
                "key_strengths": insights.get("highlights", {}).get("strengths", []),
                "concerns": insights.get("highlights", {}).get("concerns", []),
                "timeline": insights.get("timeline", [])
            }
            try:
                self.client.table("interview_insights").insert(insights_row).execute()
            except Exception as e:
                print(f"Warning: Failed to save to interview_insights table with session_id: {e}")
                # Fallback to old format just in case schema isn't fully migrated
                old_insights_row = {
                    "interview_id": uuid_str,
                    "summary": insights.get("summary", {}),
                    "highlights": insights.get("highlights", {}),
                    "skill_map": insights.get("skill_map", {}),
                    "timeline": insights.get("timeline", [])
                }
                try:
                    self.client.table("interview_insights").insert(old_insights_row).execute()
                except Exception as e2:
                    print(f"Warning: Failed to save to interview_insights table (old schema): {e2}")

            # 2. Save to interview_recommendations
            rec_row = {
                "session_id": uuid_str,
                "primary_pathway": rec.get("primary_pathway", "Employment Support"),
                "secondary_pathway": rec.get("secondary_pathway", ""),
                "priority": rec.get("priority", "Medium"),
                "founder_attention_required": bool(rec.get("founder_attention", False))
            }
            try:
                self.client.table("interview_recommendations").insert(rec_row).execute()
            except Exception as e:
                print(f"Warning: Failed to save to interview_recommendations table with session_id: {e}")
                old_rec_row = {
                    "interview_id": uuid_str,
                    "primary_pathway": rec.get("primary_pathway", "Employment Support"),
                    "secondary_pathway": rec.get("secondary_pathway", ""),
                    "priority": rec.get("priority", "Medium"),
                    "founder_attention": bool(rec.get("founder_attention", False))
                }
                try:
                    self.client.table("interview_recommendations").insert(old_rec_row).execute()
                except Exception as e2:
                    pass

            # 3. Save to interview_tags
            tags = insights.get("tags", [])
            if tags:
                tag_rows = [{"session_id": uuid_str, "tag_name": t} for t in tags]
                try:
                    self.client.table("interview_tags").insert(tag_rows).execute()
                except Exception as e:
                    print(f"Warning: Failed to save to interview_tags table with session_id: {e}")
                    old_tag_rows = [{"interview_id": uuid_str, "tag": t} for t in tags]
                    try:
                        self.client.table("interview_tags").insert(old_tag_rows).execute()
                    except Exception as e2:
                        pass

            # 4. Save to interview_actions
            if alert and alert.get("alert_type"):
                action_row = {
                    "session_id": uuid_str,
                    "alert_type": alert.get("alert_type"),
                    "message": alert.get("alert_message", "")
                }
                try:
                    self.client.table("interview_actions").insert(action_row).execute()
                except Exception as e:
                    print(f"Warning: Failed to save to interview_actions table with session_id: {e}")
                    old_action_row = {
                        "interview_id": uuid_str,
                        "action_type": alert.get("alert_type"),
                        "description": alert.get("alert_message", "")
                    }
                    try:
                        self.client.table("interview_actions").insert(old_action_row).execute()
                    except Exception as e2:
                        pass
                    
        except Exception as e:
            print(f"Error in save_founder_insights: {e}")

    async def get_founder_dashboard_overview(self) -> dict:
        """Retrieve aggregated dashboard overview cards from actual database statistics."""
        try:
            try:
                res_total = self.client.table("interview_sessions").select("id", count="exact").limit(1).execute()
            except Exception:
                res_total = self.client.table("interviews").select("id", count="exact").limit(1).execute()
                
            db_total = res_total.count if res_total.count is not None else 0
            
            # Query NeuroAI Prep session counts
            db_neuroai = 0
            try:
                res_neuroai = self.client.table("interviews").select("id", count="exact").ilike("interview_mode", "%neuro%").execute()
                db_neuroai = res_neuroai.count if res_neuroai.count is not None else 0
            except Exception as e_neuro:
                print("Warning: Failed to fetch neuroai counts:", e_neuro)
                
            # Query Pathway Discovery session counts
            db_pathway = 0
            try:
                res_pathway = self.client.table("interviews").select("id", count="exact").ilike("interview_mode", "%pathway%").execute()
                db_pathway = res_pathway.count if res_pathway.count is not None else 0
            except Exception as e_path:
                print("Warning: Failed to fetch pathway counts:", e_path)
            
            # Query active human reviews needed
            db_review = 0
            try:
                res_review = self.client.table("interview_sessions").select("id", count="exact").in_("status", ["Founder Review", "Review Required"]).execute()
                db_review = res_review.count if res_review.count is not None else 0
            except Exception:
                pass

            # Query corporate leads (DE&I recommended pathway or Corporate label)
            db_corporate = 0
            try:
                res_corp = self.client.table("interview_recommendations").select("session_id", count="exact").ilike("primary_pathway", "%de&i%").execute()
                db_corporate = res_corp.count if res_corp.count is not None else 0
            except Exception:
                pass

            # Query caregiver leads (Parent Support / Respite pathways)
            db_caregiver = 0
            try:
                res_care = self.client.table("interview_recommendations").select("session_id", count="exact").ilike("primary_pathway", "%caregiver%").execute()
                db_caregiver = res_care.count if res_care.count is not None else 0
            except Exception:
                pass

            # Query high potential candidates
            db_high = 0
            try:
                res_high = self.client.table("interview_recommendations").select("session_id", count="exact").eq("priority", "High").execute()
                db_high = res_high.count if res_high.count is not None else 0
            except Exception:
                pass
            
            return {
                "total_interviews": db_total,
                "candidates_routed": db_total,
                "require_review": db_review,
                "corporate_leads": db_corporate,
                "caregiver_leads": db_caregiver,
                "high_potential_candidates": db_high,
                "neuroai_prep_sessions": db_neuroai,
                "pathway_discovery_sessions": db_pathway
            }
        except Exception as e:
            print("Warning: Failed to fetch dashboard overview from database, using fallback stats. Error:", e)
            return {
                "total_interviews": 0,
                "candidates_routed": 0,
                "require_review": 0,
                "corporate_leads": 0,
                "caregiver_leads": 0,
                "high_potential_candidates": 0,
                "neuroai_prep_sessions": 0,
                "pathway_discovery_sessions": 0
            }

    async def get_candidate_intelligence_table(self) -> list[dict]:
        """Retrieve candidate grid rows. Merges actual interviews with standard mock entries."""
        mock_candidates = [
            {"id": "mock-john", "name": "John", "type": "Candidate", "recommended_pathway": "Employment", "confidence": "92%", "status": "Auto Routed", "tags": ["#VideoEditing", "#EmploymentSupport", "#PortfolioCoaching"]},
            {"id": "mock-sarah", "name": "Sarah", "type": "Caregiver", "recommended_pathway": "Parent Support", "confidence": "88%", "status": "Auto Routed", "tags": ["#CaregiverSupport", "#Parenting", "#LocalGroups"]},
            {"id": "mock-ravi", "name": "Ravi", "type": "Corporate", "recommended_pathway": "DE&I", "confidence": "97%", "status": "Founder Review", "tags": ["#CorporateInclusion", "#DiversityEquityInclusion", "#Workshops"]},
            {"id": "mock-maya", "name": "Maya", "type": "Candidate", "recommended_pathway": "NeuroAI", "confidence": "74%", "status": "Review Required", "tags": ["#NeuroAI", "#FutureCohort", "#WaitingList"]}
        ]

        try:
            profiles_map = {}
            try:
                res_prof = self.client.table("profiles").select("id, full_name").execute()
                if res_prof.data:
                    profiles_map = {str(p["id"]): p["full_name"] for p in res_prof.data if "id" in p and "full_name" in p}
            except Exception as ep:
                print("Warning: Failed to fetch profiles map:", ep)

            try:
                res = self.client.table("interview_sessions").select("id, user_id, interviewer_persona, difficulty_level, created_at, status, confidence_score, interview_mode, cv_text").order("created_at", desc=True).limit(10).execute()
            except Exception:
                try:
                    res = self.client.table("interviews").select("id, user_id, interviewer_persona, difficulty_level, created_at, confidence_score, interview_mode, status, cv_text").order("created_at", desc=True).limit(10).execute()
                except Exception:
                    res = self.client.table("interviews").select("id, user_id, interviewer_persona, difficulty_level, created_at, confidence_score, interview_mode, cv_text").order("created_at", desc=True).limit(10).execute()

            if res.data:
                db_candidates = []
                for row in res.data:
                    int_id = row["id"]
                    
                    try:
                        try:
                            res_rec = self.client.table("interview_recommendations").select("*").eq("session_id", int_id).execute()
                        except Exception:
                            res_rec = self.client.table("interview_recommendations").select("*").eq("interview_id", int_id).execute()
                        rec = res_rec.data[0] if res_rec.data else {}
                    except Exception:
                        rec = {}
                        
                    try:
                        try:
                            res_tags = self.client.table("interview_tags").select("tag_name").eq("session_id", int_id).execute()
                            tags = [t["tag_name"] for t in res_tags.data] if res_tags.data else []
                        except Exception:
                            res_tags = self.client.table("interview_tags").select("tag").eq("interview_id", int_id).execute()
                            tags = [t["tag"] for t in res_tags.data] if res_tags.data else []
                    except Exception:
                        tags = []
                    
                    try:
                        try:
                            res_act = self.client.table("interview_actions").select("*").eq("session_id", int_id).execute()
                        except Exception:
                            res_act = self.client.table("interview_actions").select("*").eq("interview_id", int_id).execute()
                        act = res_act.data[0] if res_act.data else {}
                    except Exception:
                        act = {}

                    user_id = row.get("user_id")
                    
                    # Attempt to parse candidate's name from cv_text first
                    display_name = None
                    cv_text = row.get("cv_text") or ""
                    if cv_text.startswith("Name:"):
                        lines = cv_text.split("\n")
                        if len(lines) > 0 and lines[0].startswith("Name:"):
                            display_name = lines[0].replace("Name:", "").strip()
                            
                    if not display_name:
                        user_id_str = str(user_id) if user_id else None
                        display_name = profiles_map.get(user_id_str) if user_id_str else None
                    if not display_name:
                        user_str = str(user_id) if user_id else "Candidate"
                        display_name = f"User {user_str[:5]}" if len(user_str) > 8 else user_str
                    
                    mode = row.get("interview_mode") or ""
                    mode_lower = mode.lower()
                    
                    # Fallback classification type
                    fallback_type = "Candidate"
                    if "caregiver" in mode_lower:
                        fallback_type = "Caregiver"
                    elif "corporate" in mode_lower or "de&i" in mode_lower:
                        fallback_type = "Corporate"
                        
                    # Fallback recommended pathway
                    fallback_pathway = "Employment"
                    if "neuro" in mode_lower:
                        fallback_pathway = "NeuroAI"
                    elif "caregiver" in mode_lower:
                        fallback_pathway = "Parent Support"
                    elif "corporate" in mode_lower or "de&i" in mode_lower:
                        fallback_pathway = "DE&I"
                    elif "pathway" in mode_lower:
                        fallback_pathway = "Pathway Discovery"

                    primary_pathway = rec.get("primary_pathway")
                    cand_type = fallback_type
                    if primary_pathway:
                        pp_lower = primary_pathway.lower()
                        if "caregiver" in pp_lower or "parent" in pp_lower:
                            cand_type = "Caregiver"
                        elif "corporate" in pp_lower or "de&i" in pp_lower:
                            cand_type = "Corporate"
                        else:
                            cand_type = "Candidate"
                    
                    db_candidates.append({
                        "id": int_id,
                        "name": display_name,
                        "type": cand_type,
                        "recommended_pathway": primary_pathway or fallback_pathway,
                        "confidence": f"{row.get('confidence_score') or 85}%",
                        "status": row.get("status", act.get("action_type", act.get("alert_type", "Auto Routed"))),
                        "tags": tags or ["#TechnicalSkills", "#GeneralCandidate"],
                        "alert_type": act.get("action_type", act.get("alert_type")),
                        "alert_message": act.get("description", act.get("message"))
                    })
                return db_candidates + mock_candidates
            
            return mock_candidates
        except Exception as e:
            print("Warning: Failed to fetch candidate table from database. Returning fallbacks. Error:", e)
            return mock_candidates

    async def get_candidate_intelligence_report(self, interview_id: str) -> dict | None:
        """Retrieve detailed intelligence report for a single candidate mock run."""
        if interview_id == "mock-john":
            return {
                "summary": {
                    "age_group": "22-25",
                    "education": "BA Film Making & Editing",
                    "location": "Kerala",
                    "current_status": "Seeking Employment",
                    "experience": "2 Internships",
                    "primary_goal": "Video Editing Opportunities",
                    "challenges": ["Portfolio Positioning", "Interview Preparation"],
                    "suggested_support": ["Portfolio Coaching", "Employment Readiness"]
                },
                "recommendation": {
                    "primary_pathway": "Employment Support",
                    "secondary_pathway": "Portfolio Coaching",
                    "priority": "Medium",
                    "founder_attention": False
                },
                "highlights": {
                    "strengths": ["Strong editing background", "Has internship experience", "Good communication", "Actively applying"],
                    "concerns": ["Portfolio not well structured", "Limited professional experience", "Needs networking support"]
                },
                "skill_map": {
                    "communication": 8,
                    "technical_skill": 7,
                    "portfolio": 5,
                    "job_readiness": 6,
                    "confidence": 7
                },
                "timeline": [
                    {"time": "10:02", "topic": "Introduction"},
                    {"time": "10:05", "topic": "Education Discussion"},
                    {"time": "10:11", "topic": "Internship Experience"},
                    {"time": "10:20", "topic": "Portfolio Discussion"},
                    {"time": "10:35", "topic": "Job Search Challenges"},
                    {"time": "10:41", "topic": "Action Recommendations"}
                ],
                "tags": ["#VideoEditing", "#EmploymentSupport", "#PortfolioCoaching", "#JobSeeking", "#FilmIndustry"],
                "alert": None
            }
        elif interview_id == "mock-sarah":
            return {
                "summary": {
                    "age_group": "35-40",
                    "education": "High School Graduate",
                    "location": "Delhi / NCR",
                    "current_status": "Caregiving Full-time",
                    "experience": "Mother of 2",
                    "primary_goal": "Parental Respite Support",
                    "challenges": ["Time constraints", "Special needs care stress"],
                    "suggested_support": ["Parent Support Groups", "Caregiver Respite"]
                },
                "recommendation": {
                    "primary_pathway": "Parent Support",
                    "secondary_pathway": "Caregiver Respite Support",
                    "priority": "Medium",
                    "founder_attention": False
                },
                "highlights": {
                    "strengths": ["Extreme patience and empathy", "Resourceful in care coordination"],
                    "concerns": ["High level of stress and fatigue", "Limited financial options"]
                },
                "skill_map": {
                    "communication": 9,
                    "technical_skill": 4,
                    "portfolio": 3,
                    "job_readiness": 7,
                    "confidence": 8
                },
                "timeline": [
                    {"time": "10:02", "topic": "Introduction"},
                    {"time": "10:08", "topic": "Family Context & Needs"},
                    {"time": "10:18", "topic": "Caregiving Challenges"},
                    {"time": "10:30", "topic": "Respite Support Ideas"},
                    {"time": "10:40", "topic": "Suggested Pathways"}
                ],
                "tags": ["#CaregiverSupport", "#Parenting", "#LocalGroups"],
                "alert": None
            }
        elif interview_id == "mock-ravi":
            return {
                "summary": {
                    "age_group": "30-35",
                    "education": "Master of Corporate Relations",
                    "location": "Mumbai",
                    "current_status": "HR/DE&I Lead",
                    "experience": "5 Years Experience",
                    "primary_goal": "Workshop & Corporate training opportunities",
                    "challenges": ["Procurement constraints", "Corporate program approval"],
                    "suggested_support": ["Corporate Partnerships", "Custom Workshop Templates"]
                },
                "recommendation": {
                    "primary_pathway": "DE&I",
                    "secondary_pathway": "Corporate Partnerships",
                    "priority": "High",
                    "founder_attention": True
                },
                "highlights": {
                    "strengths": ["Connected with corporate decision makers", "Advocate for neurodiversity inclusion"],
                    "concerns": ["Slow sales process", "Requires custom pilot presentation"]
                },
                "skill_map": {
                    "communication": 9,
                    "technical_skill": 8,
                    "portfolio": 7,
                    "job_readiness": 9,
                    "confidence": 9
                },
                "timeline": [
                    {"time": "10:02", "topic": "Introduction"},
                    {"time": "10:06", "topic": "Corporate Background"},
                    {"time": "10:14", "topic": "Neurodiversity in Workplace"},
                    {"time": "10:28", "topic": "Partnership Potential"},
                    {"time": "10:42", "topic": "Founder Review Flagged"}
                ],
                "tags": ["#CorporateInclusion", "#DiversityEquityInclusion", "#Workshops"],
                "alert": {
                    "alert_type": "Corporate Lead",
                    "alert_message": "Corporate representative detected. Possible workshop opportunity. Urgent founder review recommended."
                }
            }
        elif interview_id == "mock-maya":
            return {
                "summary": {
                    "age_group": "21-24",
                    "education": "B.Sc. Computer Science",
                    "location": "Bangalore",
                    "current_status": "Student / Aspiring AI Developer",
                    "experience": "College Projects",
                    "primary_goal": "Wants to enter NeuroAI cohort",
                    "challenges": ["Core AI/ML foundations", "Resume structure"],
                    "suggested_support": ["NeuroAI Cohort Prep", "Technical Mentorship"]
                },
                "recommendation": {
                    "primary_pathway": "NeuroAI",
                    "secondary_pathway": "Employment Support",
                    "priority": "High",
                    "founder_attention": True
                },
                "highlights": {
                    "strengths": ["Eager to learn ML structures", "Has basic Python/SQL knowledge"],
                    "concerns": ["Lacks mathematical foundation for deep learning", "Project portfolio is basic"]
                },
                "skill_map": {
                    "communication": 7,
                    "technical_skill": 6,
                    "portfolio": 5,
                    "job_readiness": 5,
                    "confidence": 6
                },
                "timeline": [
                    {"time": "10:02", "topic": "Introduction"},
                    {"time": "10:07", "topic": "Academic Details"},
                    {"time": "10:15", "topic": "AI/ML Interest Discussion"},
                    {"time": "10:28", "topic": "NeuroAI Cohort Fit"},
                    {"time": "10:39", "topic": "Next Action Steps"}
                ],
                "tags": ["#NeuroAI", "#FutureCohort", "#WaitingList"],
                "alert": {
                    "alert_type": "NeuroAI Interest",
                    "alert_message": "Interested in upcoming NeuroAI cohort. Add to waiting list."
                }
            }

        try:
            uuid_str = self._get_uuid(interview_id)
            try:
                res_ins = self.client.table("interview_insights").select("*").eq("session_id", uuid_str).execute()
            except Exception:
                res_ins = self.client.table("interview_insights").select("*").eq("interview_id", uuid_str).execute()
                
            if res_ins.data:
                insight = res_ins.data[0]
                
                try:
                    try:
                        res_rec = self.client.table("interview_recommendations").select("*").eq("session_id", uuid_str).execute()
                    except Exception:
                        res_rec = self.client.table("interview_recommendations").select("*").eq("interview_id", uuid_str).execute()
                    rec = res_rec.data[0] if res_rec.data else {}
                except Exception:
                    rec = {}
                    
                try:
                    try:
                        res_tags = self.client.table("interview_tags").select("tag_name").eq("session_id", uuid_str).execute()
                        tags = [t["tag_name"] for t in res_tags.data] if res_tags.data else []
                    except Exception:
                        res_tags = self.client.table("interview_tags").select("tag").eq("interview_id", uuid_str).execute()
                        tags = [t["tag"] for t in res_tags.data] if res_tags.data else []
                except Exception:
                    tags = []

                try:
                    try:
                        res_act = self.client.table("interview_actions").select("*").eq("session_id", uuid_str).execute()
                    except Exception:
                        res_act = self.client.table("interview_actions").select("*").eq("interview_id", uuid_str).execute()
                    act = res_act.data[0] if res_act.data else {}
                except Exception:
                    act = {}

                try:
                    res_int_scores = self.client.table("interviews").select("communication_score, technical_depth_score, leadership_score, problem_solving_score, confidence_score, recording_url, detailed_feedback").eq("id", uuid_str).execute()
                    db_scores = res_int_scores.data[0] if res_int_scores.data else {}
                except Exception:
                    db_scores = {}

                skill_map = insight.get("skill_map") or {}
                if not skill_map:
                    skill_map = {
                        "communication": db_scores.get("communication_score") or 6,
                        "technical_skill": db_scores.get("technical_depth_score") or db_scores.get("problem_solving_score") or 6,
                        "portfolio": db_scores.get("leadership_score") or 5,
                        "job_readiness": db_scores.get("problem_solving_score") or 6,
                        "confidence": db_scores.get("confidence_score") or 6
                    }

                recording_url = db_scores.get("recording_url") or _IN_MEMORY_INTERVIEW_STORE.get(interview_id, {}).get("recording_url") or _IN_MEMORY_INTERVIEW_STORE.get(uuid_str, {}).get("recording_url")

                messages = []
                try:
                    msg_res = self.client.table("interview_messages").select("*").eq("interview_id", uuid_str).order("created_at").execute()
                    if msg_res.data:
                        messages = [{"role": m.get("role"), "content": m.get("content")} for m in msg_res.data]
                except Exception:
                    pass

                return {
                    "summary": insight.get("summary", {
                        "age_group": insight.get("age_group"),
                        "education": insight.get("education"),
                        "location": insight.get("location"),
                        "current_status": insight.get("current_status"),
                        "experience": insight.get("experience"),
                        "primary_goal": insight.get("primary_goal"),
                        "challenges": insight.get("challenges"),
                        "suggested_support": insight.get("suggested_support")
                    }),
                    "recommendation": {
                        "primary_pathway": rec.get("primary_pathway", "Employment Support"),
                        "secondary_pathway": rec.get("secondary_pathway", ""),
                        "priority": rec.get("priority", "Medium"),
                        "founder_attention": bool(rec.get("founder_attention", rec.get("founder_attention_required", False)))
                    },
                    "highlights": insight.get("highlights", {
                        "strengths": insight.get("key_strengths"),
                        "concerns": insight.get("concerns")
                    }),
                    "skill_map": skill_map,
                    "timeline": insight.get("timeline", []),
                    "tags": tags,
                    "recording_url": recording_url,
                    "messages": messages,
                    "detailed_feedback": db_scores.get("detailed_feedback"),
                    "alert": {
                        "alert_type": act.get("action_type", act.get("alert_type")),
                        "alert_message": act.get("description", act.get("message"))
                    } if act.get("action_type") or act.get("alert_type") else None
                }
        except Exception as e:
            print(f"Error fetching candidate intelligence report for {interview_id}: {e}")
            
        try:
            uuid_str = self._get_uuid(interview_id)
            res_int = self.client.table("interviews").select("cv_text, job_description, recording_url, detailed_feedback").eq("id", uuid_str).execute()
            if res_int.data:
                row = res_int.data[0]
                
                # Fetch actual transcript messages for better fallback accuracy
                messages = []
                try:
                    msg_res = self.client.table("interview_messages").select("*").eq("interview_id", uuid_str).order("created_at").execute()
                    if msg_res.data:
                        messages = [{"role": m.get("role"), "content": m.get("content")} for m in msg_res.data]
                except Exception:
                    pass

                from app.ai.azure_openai import AzureOpenAIClient
                client_instance = AzureOpenAIClient()
                fallback_insights = client_instance._generate_fallback_founder_insights(
                    messages=messages,
                    cv_text=row.get("cv_text"),
                    job_description=row.get("job_description")
                )
                if fallback_insights:
                    fallback_insights["recording_url"] = row.get("recording_url") or _IN_MEMORY_INTERVIEW_STORE.get(interview_id, {}).get("recording_url") or _IN_MEMORY_INTERVIEW_STORE.get(uuid_str, {}).get("recording_url")
                    fallback_insights["messages"] = messages
                    fallback_insights["detailed_feedback"] = row.get("detailed_feedback")
                    return fallback_insights
        except Exception:
            pass

        return None

    async def save_recording_url(self, interview_id: str, recording_url: str) -> None:
        uuid_str = self._get_uuid(interview_id)
        # Update memory store fallback
        if interview_id in _IN_MEMORY_INTERVIEW_STORE:
            _IN_MEMORY_INTERVIEW_STORE[interview_id]["recording_url"] = recording_url
        elif uuid_str in _IN_MEMORY_INTERVIEW_STORE:
            _IN_MEMORY_INTERVIEW_STORE[uuid_str]["recording_url"] = recording_url
            
        try:
            self.client.table("interviews").update({"recording_url": recording_url}).eq("id", uuid_str).execute()
        except Exception as e:
            # Table schema might not have the column, ignore or log
            pass




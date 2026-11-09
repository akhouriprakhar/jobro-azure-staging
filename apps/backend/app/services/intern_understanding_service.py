from typing import Any
from app.ai.azure_openai import AzureOpenAIClient
from app.repositories.intern_repository import InternRepository
from app.repositories.interview_repository import InterviewRepository


class InternUnderstandingService:
    def __init__(self) -> None:
        self.intern_repo = InternRepository()
        self.interview_repo = InterviewRepository()
        self.openai_client = AzureOpenAIClient()

    async def get_or_create_profile(self, candidate_id: str) -> dict[str, Any]:
        """Fetches the candidate's persistent profile, creating a default baseline row if not exists."""
        profile = await self.intern_repo.get_profile(candidate_id)
        if not profile:
            # Create standard default template
            default_profile = {
                "candidate_id": candidate_id,
                "education": "N/A",
                "background": "Welcome candidate. Start your first mock prep session to construct your profile.",
                "internship_interests": [],
                "learning_history": [],
                "technical_strengths": [],
                "transferable_strengths": [],
                "behavioral_strengths": [],
                "communication_preferences": [],
                "working_style_preferences": [],
                "environment_preferences": [],
                "rephrasing_requirements": "No rephrasing requests logged yet.",
                "processing_time_preferences": "Standard processing buffer.",
                "example_based_learning_preferences": "Not yet evaluated.",
                "accommodation_needs": [],
                "career_interests": [],
                "role_alignment": "Not yet aligned.",
                "industry_preferences": [],
                "long_term_aspirations": "Not yet logged."
            }
            profile = await self.intern_repo.upsert_profile(default_profile)
        return profile

    async def rebuild_profile(
        self,
        candidate_id: str,
        cv_text: str | None = None,
        self_pitch: str | None = None,
        session_id: str | None = None
    ) -> dict[str, Any]:
        """Regenerates the persistent candidate profile by analyzing all history, CV, and pitch."""
        # 1. Resolve CV and Self-Pitch (fallback to database defaults)
        if not cv_text or not self_pitch:
            db_context = await self.interview_repo.get_latest_cv_and_jd(candidate_id)
            if not cv_text:
                cv_text = db_context.get("cv_text")
            if not self_pitch:
                self_pitch = db_context.get("job_description")

        # 2. Gather all historical transcripts/feedback reports
        history_sessions = await self.interview_repo.get_candidate_history(candidate_id)
        transcript_parts = []
        learning_history = []

        for idx, session in enumerate(history_sessions):
            # Extract basic metadata for learning logs
            sess_id = session.get("id")
            mode = session.get("interview_mode", "Practice Session")
            persona = session.get("interviewer_persona", "AI Interviewer")
            created_at = session.get("created_at")
            
            learning_history.append({
                "session_id": sess_id,
                "track": mode.replace("NeuroAI Prep: ", "") if mode else "Prep",
                "persona": persona,
                "completed_at": created_at
            })

            # Fetch messages to rebuild transcripts
            context = await self.interview_repo.get_context(sess_id)
            if context and context.get("history"):
                sess_transcript = ""
                for msg in context.get("history"):
                    role = "Candidate" if msg.get("role") == "user" else "Interviewer"
                    sess_transcript += f"{role}: {msg.get('content')}\n"
                transcript_parts.append(f"--- Session {idx+1} ({mode}) ---\n{sess_transcript}")

        combined_transcript = "\n\n".join(transcript_parts) if transcript_parts else None

        # 3. Call OpenAI to compile the structured Intern Profile
        profile_data = await self.openai_client.extract_intern_profile(
            cv_text=cv_text,
            self_pitch=self_pitch,
            transcript=combined_transcript
        )

        profile_data["candidate_id"] = candidate_id
        profile_data["learning_history"] = learning_history

        # 4. Save to Persistent DB
        updated_profile = await self.intern_repo.upsert_profile(profile_data)

        # 5. Generate descriptive character summary, embed it, and insert into Vector KB
        char_summary = self.openai_client.generate_character_summary(updated_profile)
        embedding = await self.openai_client.create_embeddings(char_summary)
        
        await self.intern_repo.add_character_embedding(
            candidate_id=candidate_id,
            session_id=session_id,
            profile_text=char_summary,
            embedding=embedding,
            metadata={
                "interests": updated_profile.get("internship_interests", []),
                "strengths": updated_profile.get("technical_strengths", []),
                "accommodation_needs": updated_profile.get("accommodation_needs", [])
            }
        )

        return updated_profile

    async def log_session_completion(
        self,
        candidate_id: str,
        session_id: str,
        messages: list[dict[str, Any]],
        cv_text: str | None = None,
        self_pitch: str | None = None
    ) -> dict[str, Any]:
        """Processes session completion: updates candidate state, logs timeline item, and rebuilds profile."""
        # 1. Compile dialogue transcript string
        transcript_str = ""
        for msg in messages:
            role = "Candidate" if msg.get("role") == "user" else "Interviewer"
            transcript_str += f"{role}: {msg.get('content')}\n"

        # 2. Extract Candidate State Classifier metrics
        state_data = await self.openai_client.evaluate_candidate_state(transcript_str)

        # 3. Map high/medium/low states to numeric scoring values for UI graphs
        mapping = {"low": 35, "medium": 70, "high": 95}
        
        confidence_val = mapping.get(state_data.get("confidence_level", "medium").lower(), 70)
        engagement_val = mapping.get(state_data.get("engagement_level", "high").lower(), 95)
        
        # Clarification clarity mapping (using support need inverse logic as a proxy)
        support_level = state_data.get("support_requirement_level", "low").lower()
        clarity_val = 90 if support_level == "low" else 65 if support_level == "medium" else 40

        # 4. Log longitudinal growth timeline entry
        await self.intern_repo.add_growth_timeline_item(
            candidate_id=candidate_id,
            session_id=session_id,
            confidence_score=confidence_val,
            career_clarity_score=clarity_val,
            self_expression_score=engagement_val
        )

        # 5. Trigger profile rebuild to incorporate the fresh dialogue context
        return await self.rebuild_profile(
            candidate_id=candidate_id,
            cv_text=cv_text,
            self_pitch=self_pitch,
            session_id=session_id
        )

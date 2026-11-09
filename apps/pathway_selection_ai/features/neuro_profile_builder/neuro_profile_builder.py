from typing import Any
from app.repositories.intern_repository import InternRepository

class NeuroProfileBuilder:
    def __init__(self, intern_repo: InternRepository | None = None) -> None:
        self.intern_repo = intern_repo or InternRepository()

    async def sync_pathway_profile_to_intern_profile(
        self,
        candidate_id: str,
        profile_data: dict[str, Any],
        scores: dict[str, int],
        primary_pathway: str
    ) -> dict[str, Any]:
        """Auto-populates the persistent intern profiles with pathway selection intelligence outputs."""
        
        # Structure profile payload for intern_profiles table
        sync_payload = {
            "candidate_id": candidate_id,
            "education": profile_data.get("identity", {}).get("education_level", "N/A"),
            "background": profile_data.get("evidence_sources", {}).get("details", "N/A"),
            "internship_interests": profile_data.get("career_interests", {}).get("primary_fields", []),
            "technical_strengths": profile_data.get("strengths", {}).get("technical", []),
            "transferable_strengths": profile_data.get("strengths", {}).get("transferable", []),
            "behavioral_strengths": profile_data.get("strengths", {}).get("behavioral", []),
            "working_style_preferences": [profile_data.get("work_preferences", {}).get("flexibility_vs_structure", "")],
            "environment_preferences": [profile_data.get("work_preferences", {}).get("collaboration_style", "")],
            "accommodation_needs": profile_data.get("support_requirements", {}).get("accommodations", []),
            "role_alignment": f"Aligned to {primary_pathway}",
            "career_interests": profile_data.get("career_interests", {}).get("primary_fields", []),
            "long_term_aspirations": profile_data.get("career_interests", {}).get("long_term_goals", "N/A")
        }

        # Sync/Upsert persistent profile in Supabase table via InternRepository
        db_profile = await self.intern_repo.upsert_profile(sync_payload)
        return db_profile

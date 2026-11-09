import uuid
from typing import Any
from supabase import create_client, Client
from app.core.config import settings


class InternRepository:
    def __init__(self) -> None:
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    def _get_uuid(self, val_id: str) -> str:
        """Ensures ID strings are formatted as valid UUIDs."""
        try:
            return str(uuid.UUID(val_id))
        except ValueError:
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, val_id))

    async def get_profile(self, candidate_id: str) -> dict[str, Any] | None:
        """Retrieves an intern's persistent profile by candidate UUID."""
        try:
            uuid_str = self._get_uuid(candidate_id)
            res = self.client.table("intern_profiles").select("*").eq("candidate_id", uuid_str).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"Error fetching intern profile for {candidate_id}: {e}")
        return None

    async def upsert_profile(self, profile_data: dict[str, Any]) -> dict[str, Any]:
        """Creates or updates an intern profile entry."""
        if "candidate_id" not in profile_data:
            raise ValueError("candidate_id is required in profile data")
        
        profile_data["candidate_id"] = self._get_uuid(profile_data["candidate_id"])
        
        try:
            res = self.client.table("intern_profiles").upsert(profile_data).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"Error saving intern profile: {e}")
            raise e
        return profile_data

    async def get_growth_timeline(self, candidate_id: str) -> list[dict[str, Any]]:
        """Retrieves longitudinal growth timeline logs for a specific intern ordered by date."""
        try:
            uuid_str = self._get_uuid(candidate_id)
            res = (
                self.client.table("intern_growth_timelines")
                .select("*")
                .eq("candidate_id", uuid_str)
                .order("recorded_at", desc=False)
                .execute()
            )
            return res.data or []
        except Exception as e:
            print(f"Error fetching growth timeline for {candidate_id}: {e}")
            return []

    async def add_growth_timeline_item(
        self,
        candidate_id: str,
        session_id: str | None,
        confidence_score: int,
        career_clarity_score: int,
        self_expression_score: int
    ) -> dict[str, Any]:
        """Logs a single longitudinal growth record for a practice session."""
        row = {
            "candidate_id": self._get_uuid(candidate_id),
            "session_id": self._get_uuid(session_id) if session_id else None,
            "confidence_score": confidence_score,
            "career_clarity_score": career_clarity_score,
            "self_expression_score": self_expression_score
        }
        try:
            res = self.client.table("intern_growth_timelines").insert(row).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"Error logging growth timeline item: {e}")
        return row

    async def add_character_embedding(
        self,
        candidate_id: str | None,
        session_id: str | None,
        profile_text: str,
        embedding: list[float],
        metadata: dict[str, Any] = None
    ) -> dict[str, Any]:
        """Saves a candidate's session character description and its vector embedding."""
        row = {
            "candidate_id": self._get_uuid(candidate_id) if candidate_id else None,
            "session_id": self._get_uuid(session_id) if session_id else None,
            "profile_text": profile_text,
            "embedding": embedding,
            "metadata": metadata or {}
        }
        try:
            res = self.client.table("intern_character_embeddings").insert(row).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"Error saving character embedding to vector db: {e}")
        return row

    async def search_similar_characters(
        self,
        embedding: list[float],
        threshold: float = 0.5,
        limit: int = 3
    ) -> list[dict[str, Any]]:
        """Queries the vector database using cosine distance via match_character_embeddings RPC."""
        try:
            res = self.client.rpc(
                "match_character_embeddings",
                {
                    "query_embedding": embedding,
                    "match_threshold": threshold,
                    "match_count": limit
                }
            ).execute()
            return res.data or []
        except Exception as e:
            print(f"Error searching vector character embeddings: {e}")
            return []

from typing import Any
from apps.pathway_selection_ai.services.candidate_understanding_engine.candidate_understanding_engine import CandidateUnderstandingEngine

class CandidateIntelligenceManager:
    def __init__(self, engine: CandidateUnderstandingEngine | None = None) -> None:
        self.engine = engine or CandidateUnderstandingEngine()

    async def get_candidate_intelligence_dna(
        self,
        registration_data: dict[str, Any],
        messages: list[dict[str, str]],
        behavioral_events: dict[str, Any],
        screen_share_events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Orchestrates candidate understanding analysis."""
        return await self.engine.analyze_candidate(
            registration_data=registration_data,
            transcript_messages=messages,
            behavioral_events=behavioral_events,
            screen_share_events=screen_share_events
        )

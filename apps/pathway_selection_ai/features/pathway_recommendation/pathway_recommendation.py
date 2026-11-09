from typing import Any
from apps.pathway_selection_ai.services.pathway_intelligence_engine.pathway_intelligence_engine import PathwayIntelligenceEngine

class PathwayRecommendationManager:
    def __init__(self, engine: PathwayIntelligenceEngine | None = None) -> None:
        self.engine = engine or PathwayIntelligenceEngine()

    async def get_pathway_recommendations(self, profile_data: dict[str, Any]) -> dict[str, Any]:
        """Orchestrates pathway recommendation analysis."""
        return await self.engine.evaluate_pathways(profile_data)

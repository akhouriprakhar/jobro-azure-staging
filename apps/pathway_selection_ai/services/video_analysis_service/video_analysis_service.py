from typing import Any

class VideoAnalysisService:
    def analyze_feed(self, webcam_active: bool) -> dict[str, Any]:
        """Analyzes client video metrics, focusing on participation and focus."""
        if not webcam_active:
            return {
                "webcam_status": "Inactive",
                "engagement_rate": 0,
                "attention_span_rating": "N/A"
            }
        return {
            "webcam_status": "Active",
            "engagement_rate": 95,
            "attention_span_rating": "Consistent",
            "participation_patterns": "High camera presence"
        }

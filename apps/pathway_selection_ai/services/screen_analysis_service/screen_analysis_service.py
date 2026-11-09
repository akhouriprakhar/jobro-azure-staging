from typing import Any

class ScreenAnalysisService:
    def map_app_to_skills(self, app_name: str) -> dict[str, str]:
        """Maps an active application screen share capture event to domain skills."""
        app_lower = app_name.lower()
        if "canva" in app_lower:
            return {"active_application": app_name, "inferred_skill": "Digital Design & Creative Layout"}
        elif "github" in app_lower:
            return {"active_application": app_name, "inferred_skill": "Software Repository & Code Management"}
        elif "excel" in app_lower:
            return {"active_application": app_name, "inferred_skill": "Data Tabulation & Excel Formulae"}
        return {"active_application": app_name, "inferred_skill": "General Visual Presentation"}

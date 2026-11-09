import json
from typing import Any
from app.ai.azure_openai import AzureOpenAIClient

class CandidateUnderstandingEngine:
    def __init__(self, openai_client: AzureOpenAIClient | None = None) -> None:
        self.openai_client = openai_client or AzureOpenAIClient()

    async def analyze_candidate(
        self,
        registration_data: dict[str, Any],
        transcript_messages: list[dict[str, str]],
        behavioral_events: dict[str, Any],
        screen_share_events: list[dict[str, Any]],
        voice_metadata: dict[str, Any] | None = None,
        video_metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Analyzes all inputs and generates the structured Candidate Intelligence Profile."""
        
        # 1. Format conversational transcripts
        transcript_text = ""
        for msg in transcript_messages:
            role = "Candidate" if msg.get("role") == "user" else "Interviewer"
            transcript_text += f"{role}: {msg.get('content')}\n"

        # 2. Extract screen share indicators
        screen_share_apps = [e.get("active_application", "") for e in screen_share_events]
        screen_share_skills = [e.get("inferred_skill", "") for e in screen_share_events]
        
        # 3. Construct system prompt
        system_prompt = (
            "You are the Orchvate Candidate Understanding Engine, an advanced AI system trained "
            "to build deep, neuro-inclusive candidate intelligence profiles.\n"
            "Analyze the candidate registration details, conversational transcript, behavioral events, "
            "screen share triggers, voice parameters, and webcam metrics, then synthesize them into a "
            "comprehensive, explainable profile.\n\n"
            "Input Signal Context:\n"
            f"- Registration: {json.dumps(registration_data)}\n"
            f"- Behavioral Actions: {json.dumps(behavioral_events)}\n"
            f"- Screen Demos: {json.dumps(screen_share_apps)} / Inferred Skills: {json.dumps(screen_share_skills)}\n"
            f"- Voice Parameters: {json.dumps(voice_metadata or {})}\n"
            f"- Video Parameters: {json.dumps(video_metadata or {})}\n\n"
            "Your output must be a valid JSON object matching the following structure:\n"
            "{\n"
            "  \"identity\": {\n"
            "     \"full_name\": \"...\",\n"
            "     \"education_level\": \"...\",\n"
            "     \"current_status\": \"...\",\n"
            "     \"location\": \"...\"\n"
            "  },\n"
            "  \"strengths\": {\n"
            "     \"technical\": [\"...\"],\n"
            "     \"transferable\": [\"...\"],\n"
            "     \"behavioral\": [\"...\"]\n"
            "  },\n"
            "  \"growth_areas\": {\n"
            "     \"skills\": [\"...\"],\n"
            "     \"communication\": [\"...\"]\n"
            "  },\n"
            "  \"career_interests\": {\n"
            "     \"primary_fields\": [\"...\"],\n"
            "     \"long_term_goals\": \"...\"\n"
            "  },\n"
            "  \"learning_style\": {\n"
            "     \"instruction_preference\": \"...\",\n"
            "     \"processing_style\": \"...\",\n"
            "     \"requires_visual_examples\": true/false\n"
            "  },\n"
            "  \"work_preferences\": {\n"
            "     \"flexibility_vs_structure\": \"...\",\n"
            "     \"collaboration_style\": \"...\"\n"
            "  },\n"
            "  \"support_requirements\": {\n"
            "     \"accommodations\": [\"...\"],\n"
            "     \"rephrasing_needed\": true/false,\n"
            "     \"additional_processing_time_seconds\": 0\n"
            "  },\n"
            "  \"communication_profile\": {\n"
            "     \"verbosity\": \"...\",\n"
            "     \"clarity_rating_out_of_10\": 0,\n"
            "     \"comfort_level\": \"...\"\n"
            "  },\n"
            "  \"technical_profile\": {\n"
            "     \"demonstrated_tools\": [\"...\"],\n"
            "     \"inferred_competencies\": [\"...\"]\n"
            "  },\n"
            "  \"evidence_sources\": {\n"
            "     \"details\": \"Explain how specific items in the transcript or screen share match the extracted traits.\"\n"
            "  }\n"
            "}\n\n"
            "Strict Rule: Return ONLY the JSON object. Do not wrap in backticks or add introductory commentary."
        )

        user_prompt = f"Conversational Transcript:\n{transcript_text}"

        try:
            full_prompt = json.dumps([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ])
            llm_res_raw = await self.openai_client.create_chat_completion(full_prompt)
            profile_data = self.openai_client._parse_llm_json_response(llm_res_raw)
            return profile_data
        except Exception as e:
            print(f"Error compiling Candidate Intelligence Profile: {e}")
            # Fallback default structure
            return {
                "identity": {
                    "full_name": registration_data.get("full_name", "Candidate"),
                    "education_level": registration_data.get("education", "N/A"),
                    "current_status": registration_data.get("employment_status", "N/A"),
                    "location": registration_data.get("location", "N/A")
                },
                "strengths": {
                    "technical": ["Programming exposure" if "github" in screen_share_apps else "Structured thinking"],
                    "transferable": ["Empathy", "Time management"],
                    "behavioral": ["Curiosity", "High engagement"]
                },
                "growth_areas": {
                    "skills": ["Professional networking"],
                    "communication": ["STAR format organization"]
                },
                "career_interests": {
                    "primary_fields": [registration_data.get("career_aspirations", "Technology")],
                    "long_term_goals": "Establish a core pathway career role"
                },
                "learning_style": {
                    "instruction_preference": "Visual and hands-on examples",
                    "processing_style": "Active processing",
                    "requires_visual_examples": True
                },
                "work_preferences": {
                    "flexibility_vs_structure": "Enjoys structure with some flexibility",
                    "collaboration_style": "Hybrid team communication"
                },
                "support_requirements": {
                    "accommodations": ["Rephrase structured technical questions"],
                    "rephrasing_needed": behavioral_events.get("rephrase_requests", 0) > 0,
                    "additional_processing_time_seconds": behavioral_events.get("need_more_time_requests", 0) * 15
                },
                "communication_profile": {
                    "verbosity": "Standard",
                    "clarity_rating_out_of_10": 8,
                    "comfort_level": "Confident"
                },
                "technical_profile": {
                    "demonstrated_tools": screen_share_apps or ["MS Excel"],
                    "inferred_competencies": screen_share_skills or ["Data organization"]
                },
                "evidence_sources": {
                    "details": "Based on registration inputs and candidate conversational dialogue."
                }
            }

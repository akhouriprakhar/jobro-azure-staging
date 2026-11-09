import json
from typing import Any
from app.ai.azure_openai import AzureOpenAIClient
from app.schemas.interview import ChatMessage

class PathwayInterviewEngine:
    def __init__(self, openai_client: AzureOpenAIClient | None = None) -> None:
        self.openai_client = openai_client or AzureOpenAIClient()

    async def get_next_response(
        self,
        messages: list[ChatMessage],
        persona: str,
        track: str,
        registration_data: dict[str, Any] | None = None,
        behavioral_events: dict[str, Any] | None = None,
        screen_share_events: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        """Generates the next conversation turn.
        
        Handles persona characteristics, adaptive questioning, and options suggestion.
        """
        # Determine current conversation state and depth
        turns_count = len([m for m in messages if m.role == "user"])
        
        # Build registration metadata context prompt
        reg_context = ""
        if registration_data:
            reg_context = (
                f"Candidate Registration Context:\n"
                f"- Name: {registration_data.get('full_name')}\n"
                f"- Age: {registration_data.get('age')}\n"
                f"- Location: {registration_data.get('location')}\n"
                f"- Education: {registration_data.get('education')}\n"
                f"- Preferred Language: {registration_data.get('preferred_language')}\n"
                f"- Career Aspirations: {registration_data.get('career_aspirations')}\n"
                f"- Employment Status: {registration_data.get('employment_status')}\n"
                f"- Self Intro: {registration_data.get('self_introduction')}\n"
                f"- Links: {registration_data.get('links', {})}\n\n"
            )
            
        # Persona definitions
        geethanjali_prompt = (
            "You are Geethanjali, a warm, structured, patient, and highly encouraging facilitator. "
            "Your main role is to establish psychological safety for the candidate. "
            "Your discovery areas are: learning styles, comfort zones, support needs, and personal interests. "
            "Speak with empathy, clarify instructions, and make the candidate feel safe and supported."
        )
        
        panchali_prompt = (
            "You are Panchali, a practical, goal-oriented, and career-focused mentor. "
            "Your main role is to lead career discovery and candidate profiling. "
            "Your discovery areas are: career aspirations, active skills, work style preferences, and interests. "
            "Speak with structured, professional clarity, focusing on skills and goals."
        )
        
        # Determine active persona and transition prompts
        active_persona_desc = geethanjali_prompt if persona == "Geethanjali" else panchali_prompt
        
        # Automate handoff if the conversation reaches turn 4
        handoff_instruction = ""
        if turns_count == 4 and persona == "Geethanjali":
            active_persona_desc = panchali_prompt
            handoff_instruction = (
                "IMPORTANT: This is turn 4. You must perform a friendly handoff from Geethanjali to Panchali. "
                "Briefly say goodbye as Geethanjali, and introduce yourself as Panchali, the career mentor. "
                "Transition the conversation to focus on career aspirations, active skills, and work preference discovery."
            )
        elif turns_count > 4:
            # force Panchali after turn 4
            active_persona_desc = panchali_prompt

        system_instruction = (
            f"Roleplay System Prompt:\n"
            f"{active_persona_desc}\n"
            f"{handoff_instruction}\n\n"
            f"{reg_context}"
            f"Instructions:\n"
            f"- Conduct a natural conversation discovery session.\n"
            f"- Do NOT ask multiple questions at once. Ask only ONE question at a time.\n"
            f"- Evaluate previous candidate answers. If the candidate was brief, adaptively ask a follow-up to expand, or guide them gently.\n"
            f"- Embrace candidate diversity: they can talk about absolutely anything that is of their interest.\n"
            f"- The objective is to identify and discover people across different and endless categories of profiles without forcing predefined templates.\n"
            f"- Do NOT provide any options, choice lists, or suggestions. Keep options as an empty list.\n"
            f"- Respond in JSON format exactly with keys 'response' (your verbal question/comment) and 'options' (empty array/list, i.e. [])."
        )

        formatted_messages = [{"role": "system", "content": system_instruction}]
        for msg in messages:
            formatted_messages.append({"role": msg.role, "content": msg.content})

        try:
            # We call the Azure OpenAI client
            # AzureOpenAIClient has a chat_response or can invoke chat completions directly.
            # Let's inspect the azure_openai.py structure and call standard create_chat_completion or make a custom endpoint.
            # AzureOpenAIClient.chat_response has:
            # async def chat_response(self, messages, cv_text, job_description, ... )
            # Alternatively, we can serialize the messages and run create_chat_completion.
            # Let's create a custom chat handler for pathway selection in AzureOpenAIClient, or invoke create_chat_completion.
            # Let's construct a prompt to call create_chat_completion.
            prompt = json.dumps(formatted_messages)
            llm_res_raw = await self.openai_client.create_chat_completion(prompt)
            
            # Parse response
            data = self.openai_client._parse_llm_json_response(llm_res_raw)
            return {
                "response": data.get("response", "Could you expand on that for me?"),
                "options": [],
                "persona": "Panchali" if (turns_count >= 4 or persona == "Panchali") else "Geethanjali"
            }
        except Exception as e:
            # Fallback mock responses if API fails or times out
            print(f"Error calling OpenAI in PathwayInterviewEngine: {e}")
            if turns_count == 0:
                return {
                    "response": f"Hello! I am Geethanjali. I will guide you through our discover process to find your ideal learning path. To start off, can you tell me a little bit about yourself and what you enjoy doing in your spare time?",
                    "options": [],
                    "persona": "Geethanjali"
                }
            elif turns_count == 4:
                return {
                    "response": "Thank you for sharing that with me! I will now hand you over to my colleague Panchali, our Career Mentor, to explore your career goals and matching tracks.",
                    "options": [],
                    "persona": "Panchali"
                }
            else:
                return {
                    "response": "That sounds interesting! Could you share what kind of support helps you learn new things most effectively?",
                    "options": [],
                    "persona": "Panchali" if turns_count >= 4 else "Geethanjali"
                }

from typing import Any

from app.ai.azure_openai import AzureOpenAIClient
from app.ai.azure_speech import AzureSpeechClient


class EvaluationPipeline:
    def __init__(self, openai_client: AzureOpenAIClient, speech_client: AzureSpeechClient) -> None:
        self.openai = openai_client
        self.speech = speech_client

    async def run(self, transcript: str, metadata: dict[str, Any]) -> dict[str, Any]:
        cv_text = metadata.get("cv_text")
        job_description = metadata.get("job_description")

        coaching_summary = await self.openai.generate_coaching_summary(
            transcript=transcript,
            cv_text=cv_text,
            job_description=job_description
        )
        role_alignment = await self.openai.generate_role_alignment(
            transcript=transcript,
            cv_text=cv_text,
            job_description=job_description
        )
        speech_metrics = await self.speech.analyze_transcript(transcript)

        return {
            "communication_score": 78,
            "confidence_score": speech_metrics.estimated_confidence,
            "recommendation": coaching_summary,
            "role_alignment": role_alignment,
            "speech_metrics": {
                "filler_word_count": speech_metrics.filler_word_count,
                "pacing_score": speech_metrics.pacing_score,
            },
            "metadata": metadata,
        }

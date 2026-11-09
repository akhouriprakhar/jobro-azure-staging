from dataclasses import dataclass

from app.core.config import settings


@dataclass
class SpeechMetrics:
    filler_word_count: int
    estimated_confidence: int
    pacing_score: int


class AzureSpeechClient:
    def __init__(self) -> None:
        self.endpoint = settings.AZURE_SPEECH_ENDPOINT.rstrip("/")
        self.key = settings.AZURE_SPEECH_KEY

    async def analyze_transcript(self, transcript: str) -> SpeechMetrics:
        # Placeholder for Azure Speech integration. A production implementation
        # would call Azure Speech REST APIs or SDK transcription metadata endpoints.
        fillers = transcript.lower().count(" um ") + transcript.lower().count(" uh ")
        return SpeechMetrics(
            filler_word_count=fillers,
            estimated_confidence=85,
            pacing_score=max(50, 100 - fillers * 5),
        )

    async def transcribe_audio(self, audio_url: str) -> str:
        # Deferred Azure Speech audio ingest integration.
        return ""  # Implement with Azure Speech SDK or REST audio transcription.

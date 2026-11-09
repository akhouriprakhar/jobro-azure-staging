import os
from pathlib import Path
import json
from typing import Any

class SharePointService:
    def __init__(self) -> None:
        # Define default local workspace base storage path
        self.base_path = Path(__file__).resolve().parents[2] / "storage"
        self._ensure_folders()

    def _ensure_folders(self) -> None:
        """Create folders if they do not exist."""
        os.makedirs(self.base_path / "transcripts", exist_ok=True)
        os.makedirs(self.base_path / "recordings", exist_ok=True)
        os.makedirs(self.base_path / "analysis", exist_ok=True)
        os.makedirs(self.base_path / "recommendations", exist_ok=True)

    def save_session_data(
        self,
        candidate_id: str,
        session_id: str,
        transcript: str,
        profile: dict[str, Any],
        pathway_scores: dict[str, Any],
        audio_content: bytes | None = None,
        video_content: bytes | None = None,
        screen_content: bytes | None = None
    ) -> dict[str, str]:
        """Saves session files to simulated SharePoint folders."""
        self._ensure_folders()
        
        # Save transcript
        tx_path = self.base_path / f"transcripts/{candidate_id}_{session_id}.txt"
        with open(tx_path, "w", encoding="utf-8") as f:
            f.write(transcript)

        # Save profile
        profile_path = self.base_path / f"analysis/{candidate_id}_{session_id}_profile.json"
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=2)

        # Save recommendations
        rec_path = self.base_path / f"recommendations/{candidate_id}_{session_id}_pathway.json"
        with open(rec_path, "w", encoding="utf-8") as f:
            json.dump(pathway_scores, f, indent=2)

        # Save binary recording files if provided
        if audio_content:
            with open(self.base_path / f"recordings/{candidate_id}_{session_id}_audio.wav", "wb") as f:
                f.write(audio_content)
        if video_content:
            with open(self.base_path / f"recordings/{candidate_id}_{session_id}_video.mp4", "wb") as f:
                f.write(video_content)
        if screen_content:
            with open(self.base_path / f"recordings/{candidate_id}_{session_id}_screen.mp4", "wb") as f:
                f.write(screen_content)

        return {
            "transcript_uri": str(tx_path.as_uri()),
            "analysis_uri": str(profile_path.as_uri()),
            "recommendation_uri": str(rec_path.as_uri())
        }

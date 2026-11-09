from typing import Any

class TranscriptService:
    def format_transcript(self, messages: list[dict[str, str]]) -> str:
        """Converts message lists into formatted transcripts with time indicators."""
        output = []
        for idx, msg in enumerate(messages):
            role = "Candidate" if msg.get("role") == "user" else "Interviewer"
            content = msg.get("content", "")
            # Simulating time stamps
            timestamp = f"[{idx * 30 // 60:02d}:{idx * 30 % 60:02d}]"
            output.append(f"{timestamp} {role}: {content}")
        return "\n".join(output)

from typing import Any
from app.schemas.interview import InterviewRequest
from app.repositories.interview_repository import InterviewRepository
from app.pipelines.evaluation_pipeline import EvaluationPipeline


class InterviewService:
    def __init__(self, repository: InterviewRepository, pipeline: EvaluationPipeline) -> None:
        self.repository = repository
        self.pipeline = pipeline

    async def evaluate(self, payload: InterviewRequest) -> dict:
        interview_data = payload.model_dump()
        saved = await self.repository.save_interview(interview_data)
        
        # Retrieve stored CV and Job Description contexts for the session
        context = await self.repository.get_context(payload.interview_id) or {}
        cv_text = context.get("cv_text")
        job_description = context.get("job_description")

        evaluation = await self.pipeline.run(payload.transcript, {
            "question": payload.question,
            "duration_seconds": payload.duration_seconds,
            "candidate_id": payload.candidate_id,
            "interview_id": payload.interview_id,
            "cv_text": cv_text,
            "job_description": job_description,
        })
        return {
            "interview_id": payload.interview_id,
            "candidate_id": payload.candidate_id,
            "communication_score": evaluation["communication_score"],
            "confidence_score": evaluation["confidence_score"],
            "recommendation": evaluation["recommendation"],
            "stored_record": saved,
        }

    async def save_context(
        self,
        interview_id: str,
        cv_text: str | None = None,
        job_description: str | None = None,
        history: list[Any] | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None,
        **kwargs: Any
    ) -> dict:
        return await self.repository.save_context(
            interview_id=interview_id,
            cv_text=cv_text,
            job_description=job_description,
            history=history,
            interview_mode=interview_mode,
            interviewer_persona=interviewer_persona,
            difficulty_level=difficulty_level,
            **kwargs
        )


    async def get_context(self, interview_id: str) -> dict | None:
        return await self.repository.get_context(interview_id)


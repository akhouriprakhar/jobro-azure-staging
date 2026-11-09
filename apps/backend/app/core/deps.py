from fastapi import Depends

from app.ai.azure_openai import AzureOpenAIClient
from app.ai.azure_speech import AzureSpeechClient
from app.pipelines.evaluation_pipeline import EvaluationPipeline
from app.repositories.interview_repository import InterviewRepository
from app.services.interview_service import InterviewService


def get_openai_client() -> AzureOpenAIClient:
    return AzureOpenAIClient()


def get_speech_client() -> AzureSpeechClient:
    return AzureSpeechClient()


def get_evaluation_pipeline(
    openai_client: AzureOpenAIClient = Depends(get_openai_client),
    speech_client: AzureSpeechClient = Depends(get_speech_client),
) -> EvaluationPipeline:
    return EvaluationPipeline(openai_client=openai_client, speech_client=speech_client)


def get_interview_repository() -> InterviewRepository:
    return InterviewRepository()


def get_interview_service(
    repository: InterviewRepository = Depends(get_interview_repository),
    pipeline: EvaluationPipeline = Depends(get_evaluation_pipeline),
) -> InterviewService:
    return InterviewService(repository=repository, pipeline=pipeline)

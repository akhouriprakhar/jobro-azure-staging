from fastapi import APIRouter, Depends, HTTPException
from app.schemas.intern_profile import (
    InternProfileResponse,
    GrowthTimelineResponse,
    InternProfileRebuildRequest,
)
from app.services.intern_understanding_service import InternUnderstandingService
from app.repositories.intern_repository import InternRepository


router = APIRouter()


@router.get("/profile/{candidate_id}", response_model=InternProfileResponse)
async def get_intern_profile(
    candidate_id: str,
    service: InternUnderstandingService = Depends(InternUnderstandingService),
):
    """Retrieves or creates the persistent Intern Profile for a candidate."""
    try:
        profile = await service.get_or_create_profile(candidate_id)
        return InternProfileResponse(**profile)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch intern profile: {str(e)}")


@router.get("/timeline/{candidate_id}", response_model=GrowthTimelineResponse)
async def get_intern_growth_timeline(
    candidate_id: str,
    repository: InternRepository = Depends(InternRepository),
):
    """Retrieves all longitudinal growth log items for the candidate's visual trend line."""
    try:
        timeline_items = await repository.get_growth_timeline(candidate_id)
        return GrowthTimelineResponse(candidate_id=candidate_id, timeline=timeline_items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch growth timeline: {str(e)}")


@router.post("/profile/rebuild/{candidate_id}", response_model=InternProfileResponse)
async def rebuild_intern_profile(
    candidate_id: str,
    payload: InternProfileRebuildRequest,
    service: InternUnderstandingService = Depends(InternUnderstandingService),
):
    """Manually forces a rebuild of the candidate profile from CV, self pitch, and all historical interviews."""
    try:
        profile = await service.rebuild_profile(
            candidate_id=candidate_id,
            cv_text=payload.cv_text,
            self_pitch=payload.self_pitch
        )
        return InternProfileResponse(**profile)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rebuild profile: {str(e)}")

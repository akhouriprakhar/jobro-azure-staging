import logging
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, status
import httpx
from app.core.config import settings
from app.repositories.interview_repository import InterviewRepository

router = APIRouter()
logger = logging.getLogger(__name__)

async def get_msgraph_token() -> str | None:
    """Retrieve Access Token using App Credentials for MS Graph API."""
    if not all([settings.SHAREPOINT_TENANT_ID, settings.SHAREPOINT_CLIENT_ID, settings.SHAREPOINT_CLIENT_SECRET]):
        logger.warning("SharePoint/Microsoft Graph app credentials are not fully configured.")
        return None
        
    url = f"https://login.microsoftonline.com/{settings.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id": settings.SHAREPOINT_CLIENT_ID,
        "client_secret": settings.SHAREPOINT_CLIENT_SECRET,
        "grant_type": "client_credentials",
        "scope": "https://graph.microsoft.com/.default"
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(url, data=data, timeout=10.0)
            if r.status_code == 200:
                return r.json().get("access_token")
            else:
                logger.error(f"Graph API auth returned status {r.status_code}: {r.text}")
                return None
    except Exception as e:
        logger.error(f"Failed to fetch MS Graph token: {e}")
        return None

@router.post("/interviews/{interview_id}/recording")
async def upload_interview_recording(interview_id: str, file: UploadFile = File(...)):
    logger.info(f"Received recording upload request for interview {interview_id}")
    
    # Read the file content
    file_bytes = await file.read()
    file_size = len(file_bytes)
    filename = f"Session_{interview_id}.webm"
    
    # 1. Attempt SharePoint/MS Graph Upload
    token = await get_msgraph_token()
    if token and settings.SHAREPOINT_DRIVE_ID:
        try:
            logger.info("Uploading recording to SharePoint via MS Graph API...")
            headers = {"Authorization": f"Bearer {token}"}
            sp_session_url = f"https://graph.microsoft.com/v1.0/drives/{settings.SHAREPOINT_DRIVE_ID}/root:/{filename}:/createUploadSession"
            
            async with httpx.AsyncClient() as client:
                session_res = await client.post(sp_session_url, headers=headers, json={}, timeout=10.0)
                if session_res.status_code == 200:
                    upload_url = session_res.json().get("uploadUrl")
                    upload_headers = {
                        "Content-Length": str(file_size),
                        "Content-Range": f"bytes 0-{file_size-1}/{file_size}"
                    }
                    put_res = await client.put(upload_url, headers=upload_headers, content=file_bytes, timeout=30.0)
                    if put_res.status_code in (200, 201):
                        web_url = put_res.json().get("webUrl")
                        logger.info(f"Successfully uploaded to SharePoint: {web_url}")
                        
                        # Save in DB
                        repo = InterviewRepository()
                        await repo.save_recording_url(interview_id, web_url)
                        return {"status": "success", "url": web_url, "provider": "sharepoint"}
                    else:
                        logger.error(f"SharePoint put failed with status {put_res.status_code}: {put_res.text}")
                else:
                    logger.error(f"SharePoint create upload session failed: {session_res.text}")
        except Exception as e:
            logger.error(f"SharePoint upload failed with exception: {e}")
            
    # 2. Local Fallback: Save file to local disk for development/testing
    try:
        logger.info("Using local filesystem fallback for recording storage...")
        # Save to static directory inside backend
        static_dir = Path(__file__).resolve().parents[4] / "apps" / "frontend" / "public" / "recordings"
        static_dir.mkdir(parents=True, exist_ok=True)
        
        filepath = static_dir / filename
        with open(filepath, "wb") as f:
            f.write(file_bytes)
            
        local_url = f"/recordings/{filename}"
        logger.info(f"Successfully saved recording locally at {local_url}")
        
        # Save in DB
        repo = InterviewRepository()
        await repo.save_recording_url(interview_id, local_url)
        return {"status": "success", "url": local_url, "provider": "local_fallback"}
    except Exception as fallback_err:
        logger.error(f"Local storage fallback also failed: {fallback_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store recording file: {str(fallback_err)}"
        )

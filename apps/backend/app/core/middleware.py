import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("jobro.middleware")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger.info("Request start", extra={"path": request.url.path, "method": request.method})
        response = await call_next(request)
        logger.info(
            "Request complete",
            extra={"path": request.url.path, "method": request.method, "status_code": response.status_code},
        )
        return response

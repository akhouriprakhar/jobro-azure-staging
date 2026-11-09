# JOBRO Backend

The backend app is a FastAPI-based API gateway for JOBRO. It is designed for modular service orchestration, Azure AI integration, and enterprise evaluation workflows.

## Architecture

- `app/main.py` — application entrypoint
- `app/api/v1/routes` — route definitions for versioned API endpoints
- `app/services` — service layer for domain logic
- `app/schemas` — request/response contracts
- `app/core` — configuration, logging, and middleware

## Run locally

```bash
cd apps/backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment

Copy `shared/configs/.env.example` to `.env` and update Azure variables before deployment.

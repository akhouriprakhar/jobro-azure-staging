# JOBRO Platform

Enterprise-grade monorepo architecture for JOBRO — a multimodal AI interview intelligence platform.

## Repository Layout

- `apps/frontend` — Next.js candidate experience and recruiter dashboard UI
- `apps/backend` — FastAPI API gateway, orchestration entrypoint, and AI integration
- `services` — placeholder for domain microservices (transcription, evaluation, coaching, analytics)
- `shared/schemas` — cross-stack shared contracts for TypeScript and Python
- `shared/configs` — environment and configuration templates
- `shared/utils` — reusable helper modules and Azure integration patterns
- `infrastructure/docker` — service-specific Dockerfiles
- `infrastructure/terraform` — Azure infrastructure scaffolding
- `.github/workflows` — CI/CD automation for build, test, and deployment

## Goals

- Next.js frontend with modular UI
- FastAPI backend with clean, layered architecture
- Microservice-ready design with shared schemas
- Docker-first development and Azure deployment support
- GitHub Actions CI for end-to-end validation
- Enterprise-ready structure for scaling and extensibility

## Getting Started

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

### Backend

```bash
cd apps/backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Azure Deployment

- Build Docker images for frontend and backend
- Publish to Azure Container Registry
- Deploy to Azure Container Apps or Azure App Service
- Use GitHub Actions workflow in `.github/workflows/ci.yml`

# EmberPath

A minimal full-stack boilerplate for wildfire evacuation demos. The frontend is a Next.js dashboard with Mapbox overlays, and the backend is a FastAPI service that serves mock evacuation data.

## Quick Start

```bash
git clone <repo>
cd hivehack
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
npm --prefix frontend install
python -m venv backend/.venv
backend/.venv/Scripts/activate
pip install -r backend/requirements.txt
```

## Run with Docker Compose

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Health check: `curl http://localhost:8000/health`

## Project Layout

```
frontend/    # Next.js + Tailwind client UI
backend/     # FastAPI mock API
```

Refer to `AGENTS.md` for contributor guidelines.
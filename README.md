# EmberPath

EmberPath is a wildfire-aware evacuation demo. The frontend is a Next.js 14 + Mapbox app, and the backend is a FastAPI service that serves live wildfire overlays, a deterministic historical replay, and route/fire-impact data with graceful fallbacks.

## What the app does today

- `Live Data` mode fetches current wildfire perimeters from ArcGIS, smoke plumes from NOAA/ArcGIS, and backend status/update payloads from FastAPI.
- `Sample Fallback` mode uses static sample overlays and routes in the frontend so the demo still works when live dependencies fail.
- `Historical Showcase` mode replays a fixed Palisades Fire timeline from `backend/app/data/palisades_history.json`.
- Route search in the current frontend uses Mapbox geocoding and Mapbox Directions for place search and route geometry.
- When `fire_perimeters` is enabled in live mode, the frontend also calls `POST /api/routes` so the backend can return `fire_impact` metadata for the trip.
- The backend can compute OSMnx/NetworkX routes on its own, but if heavy routing dependencies or graph warmup fail it degrades to mock/unavailable responses instead of crashing.

## Stack

- Frontend: Next.js 14, React 18, Tailwind, Mapbox GL
- Backend: FastAPI, Pydantic, OSMnx, NetworkX, Shapely, GeoPandas
- Infra: Docker Compose, Postgres, Redis
- Live data sources: ArcGIS wildfire perimeter feed and NOAA smoke polygons

## Repository layout

```text
frontend/
  src/app/page.tsx                 Main app shell and mode orchestration
  src/components/MapView.tsx       Mapbox rendering
  src/components/Sidebar.tsx       Mode switcher, route search, overlays, fire list
  src/components/StatusBanner.tsx  Live status/update summary
  src/components/TimelineSlider.tsx Historical replay timeline
  src/lib/api.ts                   Frontend API client + Mapbox calls
  src/lib/fallback-sample.ts       Static fallback demo payload
  src/lib/fire-timeline.ts         Frontend historical timeline defaults
  src/types/index.ts               Frontend contracts

backend/
  app/main.py                      API routes, startup pings, fallback wiring
  app/models.py                    Pydantic request/response models
  app/fire_data.py                 Live ArcGIS wildfire + smoke fetch/normalization
  app/historical_data.py           Historical replay loader
  app/router.py                    OSMnx/NetworkX route computation
  app/graph.py                     OSM graph download/cache warmup
  app/mock.py                      Fallback status/overlay/update/route payloads
  app/data/palisades_history.json  Historical replay source
  tests/test_live_history.py       Backend tests for live/history/routing behavior

docker-compose.yml                 Frontend, backend, postgres, redis
AGENTS.md                          Repo-specific contributor guidance
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- A Mapbox token for the frontend
- Docker Desktop if you want to run the full stack with Compose

## Environment variables

Frontend (`frontend/.env.local`):

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.YOUR_TOKEN_HERE
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Backend (`backend/.env`):

```env
DATABASE_URL=postgresql://ember:ember@postgres:5432/emberpath
REDIS_URL=redis://redis:6379/0
ROUTING_PROVIDER=osm
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
```

Notes:

- `NEXT_PUBLIC_MAPBOX_TOKEN` is required for place autocomplete, live route previews, and snapping historical route templates to roads.
- The backend currently only pings Postgres and Redis on startup. If those services are unavailable, startup logs warnings but the API still comes up.
- The default backend `.env.example` values are Compose-friendly hostnames (`postgres`, `redis`). They do not need to resolve for the API to boot locally.
- For Docker Compose, define `NEXT_PUBLIC_MAPBOX_TOKEN` in the repo-root `.env` so Compose can inject it into the frontend container.

## Local development

### 1. Frontend setup

From `frontend/`:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Frontend runs at [http://localhost:3000](http://localhost:3000).

### 2. Backend setup

From `backend/`:

```powershell
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at [http://localhost:8000](http://localhost:8000). Health check: [http://localhost:8000/health](http://localhost:8000/health).

### What to expect on startup

- FastAPI tries to ping Postgres and Redis.
- FastAPI attempts to warm the OSM road graph used by the routing module.
- Graph warmup failures are logged and treated as non-fatal.
- The first successful graph warmup may take a while because it downloads road data for the LA to Santa Barbara corridor.

## Run with Docker Compose

1. Create repo-root `.env` with at least:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.YOUR_TOKEN_HERE
```

2. Start the stack from the repo root:

```bash
docker compose up --build
```

Services:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## API surface

- `GET /health`
- `GET /api/status`
- `GET /api/overlays`
- `GET /api/updates`
- `GET /api/live`
- `GET /api/history/palisades`
- `POST /api/routes`

## Current runtime behavior

- `GET /api/live` returns status, overlays, updates, and key incidents.
- `GET /api/history/palisades` returns the deterministic historical incident and snapshot timeline used by the showcase mode.
- `POST /api/routes` accepts `origin`, `destination`, `overlays`, `timestamp`, and `mode`.
- In live mode, the backend fetches live fire perimeters when route fire-impact analysis is needed.
- `MapView` keeps live and historical fire layers isolated so geometry does not leak across mode switches.
- Missing heavy backend deps or upstream ArcGIS failures fall back to mock payloads instead of hard-failing endpoints.

## Tests and verification

Frontend, from `frontend/`:

```powershell
npm run lint
npm run test -- --run
```

Backend, from `backend/`:

```powershell
python -m pip install pytest
python -m pytest tests -q
```

## A few implementation details that matter

- The frontend currently renders live route geometry from Mapbox, not from the backend route engine.
- The backend route engine still matters because it provides fire-impact analysis and a degraded routing path when needed.
- Historical replay is deterministic and backed by checked-in JSON, which makes it suitable for demos and tests.
- The sample fallback path is intentionally frontend-local so the UI remains usable even if the backend or live feeds are unavailable.

Refer to [`AGENTS.md`](AGENTS.md) for contributor guidance and repo conventions.

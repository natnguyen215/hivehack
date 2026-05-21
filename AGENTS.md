# Repository Guidelines

## Project Structure & Module Organization
This repo has two apps plus Docker orchestration:
- `frontend/`: Next.js 14 + Tailwind + Mapbox UI.
  - `src/app`: App Router entry (`page.tsx`, `layout.tsx`, global styles).
  - `src/components`: `MapView`, `Sidebar`, `StatusBanner`, `TimelineSlider`.
  - `src/lib`: API client helpers and timeline utilities.
  - `src/types`: frontend API/data contracts.
- `backend/`: FastAPI service.
  - `app/main.py`: API routes, startup health pings, and fallback wiring.
  - `app/models.py`: Pydantic request/response models.
  - `app/fire_data.py`: ArcGIS live perimeter fetch + normalization.
  - `app/historical_data.py` + `app/data/palisades_history.json`: deterministic historical replay source.
  - `app/router.py` + `app/graph.py`: OSMnx/NetworkX route computation.
  - `app/mock.py`: fallback status, overlay, and update fixture payloads.
  - `app/db.py` and `app/cache.py`: placeholders/stubs.
- `backend/tests/test_live_history.py`: backend live/history route behavior tests.
- `docker-compose.yml`: `frontend`, `backend`, `postgres`, `redis` on `ember-net`.

## Current Runtime Behavior
- Frontend has explicit data modes: `live` and `historical` (mode switch in `Sidebar`).
- Live mode:
  - Manual refresh only.
  - Uses `GET /api/live` for status, overlays, updates, and key incidents.
  - Route requests use `POST /api/routes` with `mode: "live"` and render fire impact warnings.
- Historical mode:
  - Uses `GET /api/history/palisades`.
  - Timeline slider replays fixed Palisades snapshots for demos/pitch flow.
- `MapView` isolates live and historical fire sources/layers to avoid stale geometry on tab switches.
- Backend startup pings Postgres/Redis and attempts graph warmup; failures are logged but non-fatal.
- Backend routing and fire ingestion are hardened with fallbacks so missing heavy deps or upstream ArcGIS issues degrade gracefully instead of hard-failing endpoints.

## API Surface (Current)
All application endpoints are versioned under `/api/v1/`. The unversioned `/api/*`
paths are kept as 301 redirects for backwards compatibility (see Versioning Policy below).

- `GET /health` (unversioned — health checks are not versioned)
- `GET /api/v1/status`
- `GET /api/v1/overlays`
- `GET /api/v1/updates`
- `GET /api/v1/live`
- `GET /api/v1/history/palisades`
- `POST /api/v1/routes` (supports `mode` and optional `fire_impact` response metadata)
- `GET /api/v1/proxy/directions/{profile}/{coordinates}` (Mapbox Directions proxy)
- `GET /api/v1/proxy/geocoding/suggest` (Mapbox Geocoding proxy)

## API Versioning Policy
- **Current version**: `v1` — prefix all new routes `/api/v1/<resource>`.
- **Introducing a new version**: add a `v2` prefix for breaking changes; keep `v1` routes
  alive with 301 redirects pointing to the `v2` equivalents during a deprecation window.
- **Never remove a versioned prefix** without a documented deprecation notice and a
  migration window for clients.
- **Legacy redirects**: `/api/<path>` → `/api/v1/<path>` (301). These exist solely for
  clients that have not yet updated; new code must call `/api/v1/*` directly. POST
  redirects use 301 — note that some HTTP clients will downgrade the method to GET on
  follow; clients calling `POST /api/routes` should migrate to `POST /api/v1/routes`.
- **`/health`** is intentionally unversioned — it is a platform-level probe, not an
  application API.

## Build, Test, and Development Commands
Frontend (run in `frontend/`):
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test` (watch mode)
- `npm run test -- --run` or `npx vitest run` (CI/non-watch mode)

Backend (run in `backend/`):
- `python -m venv .venv`
- PowerShell: `.\.venv\Scripts\Activate.ps1`
- `pip install -r requirements.txt`
- `uvicorn app.main:app --reload`
- `python -m pytest backend/tests -q` (if `pytest` installed)

Top-level:
- `docker-compose up --build`

## Coding Style & Naming Conventions
Use TypeScript + React with 2-space indentation and single quotes. Components are `PascalCase`; hooks are `useCamelCase`; utility modules use kebab-case filenames. Keep Tailwind classes inline and use `cn()` from `src/lib/utils.ts` for class composition. Keep `mapbox-gl` usage in client components and load heavy map components via dynamic imports (`ssr: false`). Python follows lower_snake_case and Black-compatible formatting.

## Testing Guidelines
- Frontend uses Vitest + Testing Library.
- Component tests currently cover `Sidebar` and `TimelineSlider`.
- Use `npx vitest run` for non-watch verification.
- Backend has pytest coverage in `backend/tests/test_live_history.py`; extend this suite for endpoint and routing behavior changes.

## Commit & Pull Request Guidelines
Use conventional commit prefixes (`feat:`, `fix:`, `chore:`). Keep commits scoped to a single concern. PRs should include:
- concise summary
- exact verification steps executed
- UI screenshots/GIFs for frontend changes
- env/config notes for any setup changes

## Configuration & Environment Tips
- Frontend env: `frontend/.env.local` needs `NEXT_PUBLIC_MAPBOX_TOKEN` and optional `NEXT_PUBLIC_API_BASE_URL`.
- Backend env: `backend/.env` includes `DATABASE_URL`, `REDIS_URL`, `ROUTING_PROVIDER`, and `GOOGLE_MAPS_API_KEY`.
- Current backend code actively reads `DATABASE_URL` and `REDIS_URL`; `ROUTING_PROVIDER` and `GOOGLE_MAPS_API_KEY` are present for future provider work.
- For Docker Compose interpolation, define `NEXT_PUBLIC_MAPBOX_TOKEN` in repo-root `.env`.
- Never commit real tokens or secrets.

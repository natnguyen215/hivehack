# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

Use `AGENTS.md` as the source of truth for commands, style, and testing policy.

---

## Architecture Snapshot

EmberPath is a fire-safe navigation app (like Google Maps but avoids active wildfires). Two apps connected over HTTP:
- `frontend/`: Next.js 14 + Tailwind + Mapbox — full-screen map UI with floating sidebar, fire timeline, and status banner
- `backend/`: FastAPI — mock/live status, overlays, updates, route computation, historical fire data

No shared package. Contract alignment maintained between:
- `frontend/src/types/index.ts`
- `backend/app/models.py`

---

## Frontend Runtime Flow

`src/app/page.tsx` owns all app state and supports two modes:
- **Live mode**: fetches real-time data via `fetchLiveData()` (with fallback to `fetchStatus()` + `fetchUpdates()` + `fetchOverlays()`), user-initiated route search via `fetchRoutes()`
- **Historical mode**: loads `fetchHistoricalPalisades()` snapshots for Palisades fire timeline replay, falls back to `FIRE_SNAPSHOTS` from `fire-timeline.ts`

Data wiring:
- `StatusBanner` — compact dropdown in header showing active fire count + advisory
- `Sidebar` — floating glass panel with origin/destination inputs, overlay toggles, route cards, mode toggle (live/historical), live data refresh, key incidents, fire impact display, historical narrative
- `MapView` — full-screen dark map (`dark-v11` style), overlay layers, multi-route rendering
- `TimelineSlider` — bottom bar timeline (historical mode only)

Route display priority:
1. If user requested routes in live mode, show `routeData`
2. Otherwise show `historicalRouteData` built from timeline snapshot + `HISTORICAL_ROUTE_TEMPLATES`

Route geometry is snapped to real roads via `fetchDirections()` (Mapbox Directions API) with client-side caching.

---

## MapView Notes

`MapView` must stay dynamically imported with `{ ssr: false }`.

Key behavior in `src/components/MapView.tsx`:
- Accepts `mode` prop (`live` | `historical`)
- Overlay fetch happens inside `map.on('load')` callback
- Overlay source/layer IDs: `${overlayId}-source` / `${overlayId}-layer`
- Overlay visibility sync uses `syncOverlayVisibility()` (toggle visibility, not add/remove)
- Multi-route rendering uses tracked IDs in `managedRouteIdsRef` (`route-multi-*`) to avoid full style scans
- Single-route fallback uses `route-source` / `route-layer`
- Fire perimeter override: `fire_perimeters-source` / `fire_perimeters-layer`
- Fire bound changes trigger `fitBounds` once per distinct bounds key (deduplicated via `lastFireBoundsKeyRef`)
- Fire polygon hover shows popup with name/timestamp/acres (XSS-safe via `escapeHtml`)

---

## Backend Endpoints

API endpoints in `backend/app/main.py`:
- `GET /health`
- `GET /api/status` — mock wildfire status
- `GET /api/overlays` — mock overlay GeoJSON
- `GET /api/updates` — mock live updates
- `POST /api/routes` — route computation with fire impact detection
- `GET /api/live` — combined live data (status + overlays + updates + key incidents), fetches real fire perimeters from CAL FIRE
- `GET /api/history/palisades` — historical Palisades fire snapshots from `historical_data.py`

`POST /api/routes` flow:
1. Check cache (stub — always miss)
2. Compute routes via `router.compute_routes()` (needs networkx/osmnx/shapely)
3. If routing deps unavailable, falls back to mock routes from `mock.py`
4. If `mode=live` and `fire_perimeters` overlay active, fetches live fire data and runs `_detect_fire_impact()` to check route/fire intersection
5. Returns recommended + alternatives + `fire_impact`

Backend modules:
- `fire_data.py` — fetches live fire perimeters from CAL FIRE FIRIS ArcGIS service
- `historical_data.py` — loads curated Palisades fire historical snapshots
- `router.py` — OSMnx/NetworkX multi-profile route computation with fire penalty weighting
- `graph.py` — downloads and caches OSM road graph for LA-Santa Barbara corridor
- `cache.py` — stub (no-op)
- `db.py` — stub (returns None)

---

## Test Status

Current test state (all passing):
- `src/lib/__tests__/fire-timeline.test.ts` — 13 tests
- `src/components/__tests__/TimelineSlider.test.tsx` — 6 tests
- `src/components/__tests__/Sidebar.test.tsx` — 4 tests
- `npm run lint` — passes
- `npx tsc --noEmit` — passes
- `npm run build` — passes

Backend has no pytest suite yet.

---

## UI Layout

The app uses a full-screen Google Maps-style layout:
- **Header**: absolute-positioned top bar with gradient fade, EmberPath branding, status dropdown
- **Map**: fills entire viewport (`h-full w-full`)
- **Sidebar**: floating glass panel (370px wide), slides in/out with hamburger toggle, `backdrop-blur-sm`
- **Timeline**: absolute-positioned bottom bar with gradient fade (historical mode only)

Fonts: Space Grotesk (display) + JetBrains Mono (mono), loaded via `next/font/google`.

---

## Environment Notes

- Frontend requires `NEXT_PUBLIC_MAPBOX_TOKEN` for directions/geocoding/map rendering
- Docker Compose expects `NEXT_PUBLIC_MAPBOX_TOKEN` in repo root `.env`
- Backend reads `DATABASE_URL` and `REDIS_URL` in `Settings`; service runs fine without them
- Routing deps (networkx, osmnx, shapely) are optional — backend falls back to mock routes
- `docker-compose.yml` orchestrates: frontend, backend, postgis, redis on `ember-net`
- Docker Desktop must be running for `docker compose up`

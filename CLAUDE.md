# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `AGENTS.md` for commands, coding style, testing guidelines, and commit conventions.

---

## Architecture Overview

EmberPath is two independent apps (`frontend/`, `backend/`) connected only over HTTP. There is no shared library. The contract is enforced by matching TypeScript types in `src/types/index.ts` and Pydantic models in `backend/app/models.py`.

**Data flow:**
```
page.tsx (state)
  ├── fetchStatus() / fetchUpdates() on mount → StatusBanner
  ├── fetchRoutes() on origin change → Sidebar (route cards)
  └── fetchOverlays() inside MapView map `load` event → MapView layers
```

All API calls go through `frontend/src/lib/api.ts`. All backend responses come from constants in `backend/app/mock.py` — no database reads happen yet.

---

## Mapbox Lifecycle (non-obvious)

`MapView` must be imported with `{ ssr: false }` in `page.tsx` because `mapbox-gl` references `window` at module parse time. The component is already wired this way — do not move it to a static import.

Map layers are imperative. The pattern used throughout `MapView.tsx`:
- Overlays are fetched **inside the `map.on('load', ...)`** callback, not on component mount
- Sources are named `${overlayId}-source`, layers `${overlayId}-layer`
- `syncOverlays()` handles add/remove for all overlay IDs on each `activeOverlays` change
- `upsertRoute()` calls `source.setData()` if the source already exists instead of removing/re-adding

---

## Overlay Data Contract

The backend returns overlays as a **list** (`OverlaysResponse.overlays: GeoOverlay[]`). Each `GeoOverlay` has `{ id, name, category, data }` where `data` is a raw GeoJSON FeatureCollection.

`MapView` converts the list to a `Record<string, GeoOverlay>` keyed by `id` for O(1) toggle lookups. The four valid IDs are: `evac_zones`, `fire_perimeters`, `smoke_regions`, `road_closures`. Layer paint styles are keyed on these same IDs in the `overlayPaint` map in `MapView.tsx`.

---

## Replacing Mock Data

All mock data lives in `backend/app/mock.py`. To replace with real data:
- `WILDFIRE_STATUS` → live fire agency API
- `MOCK_ROUTES` → routing engine (OSRM, Valhalla, etc.)
- `OVERLAY_GEOJSON` → CAL FIRE / ArcGIS GeoJSON feeds
- `LIVE_UPDATES` → push/poll from incident API

The Pydantic models and TypeScript types don't need to change for the core fields.

---

## Settings

Backend settings are a `Settings(BaseSettings)` class inlined at the top of `app/main.py` (no separate config file). Override via environment variables or `backend/.env`. The app starts cleanly even if Postgres and Redis are unreachable — connection failures are logged as warnings only.

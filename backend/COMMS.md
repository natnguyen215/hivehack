# Backend Agent COMMS

Inter-agent communication file. Update this when you make changes that affect
other parts of the system. Read it before starting backend work.

---

## Fire Perimeter Data Sources

**Updated: 2026-04-11 | Agent: Landon (Mapper)**

### Sources Now Queried (both on every `/api/live` call)

| Source | URL | Filter | Notes |
|--------|-----|--------|-------|
| NIFC/ESRI USA Wildfires v1 | `services9.arcgis.com/.../USA_Wildfires_v1/FeatureServer/1` | `IncidentTypeCategory='WF'` + CA bbox | National aggregation via IRWIN |
| CAL FIRE / NIFC CA Exterior | `services1.arcgis.com/.../CA_Perimeters_NIFC_CALFIRE_exterior/FeatureServer/0` | CA bbox | CAL FIRE FRAP/FIRIS sourced — CA-authoritative |

### Merge Strategy (`fire_data.py::_merge_perimeter_features`)
- Both sources queried independently; individual failures are logged but non-fatal
- Deduplicated by `IRWINID`
- **CAL FIRE record wins** on IRWINID collision (more authoritative for CA fires)
- NIFC-only features appended after dedup (catches national fires CAL FIRE doesn't track)
- If both sources fail: empty FeatureCollection returned → `main.py` falls back to mock

### Normalized Feature Properties (output contract)
Every feature returned by `fetch_live_fire_perimeters()` has:
```json
{
  "id": "string (IRWINID > recordId > OBJECTID > name)",
  "name": "string",
  "acres": "float (rounded 2dp)",
  "severity": "low | moderate | high | critical",
  "updated_at": "ISO-8601 UTC string or null",
  "display_status": "string or null"
}
```

---

## Active Endpoints

| Method | Path | Handler | Returns |
|--------|------|---------|---------|
| GET | `/api/live` | `get_live()` | `LiveResponse` — status + overlays + updates + key_incidents |
| GET | `/api/overlays` | `get_overlays()` | `OverlaysResponse` — same fire/smoke/evac overlays |
| POST | `/api/routes` | `post_routes()` | `RouteResponse` — recommended + alternatives + fire_impact |
| GET | `/api/history/palisades` | `get_history_palisades()` | `HistoricalIncidentResponse` |

## Overlay IDs (used by frontend MapView)

- `fire_perimeters` — live merged NIFC + CAL FIRE GeoJSON
- `evacuation_zones` — buffered from fire perimeters via Shapely (empty if Shapely unavailable)
- `smoke_plumes` — NOAA HMS smoke polygons

---

## Known Limitations / TODOs

- [ ] CAL FIRE endpoint URL needs live validation — confirm it serves active (not archived) perimeters
- [x] **Route caching implemented** — `cache.py` now uses Redis (`setex` with 5 min TTL, graceful no-op fallback when Redis is down). `db.py::get_fire_polygon()` is dead code — `main.py` calls `fetch_live_fire_perimeters()` directly and no longer goes through `db.py`.
- [ ] No caching on `/api/live` or `/api/overlays` — ArcGIS endpoints still hit on every call (only `/api/routes` is cached)
- [ ] `_fallback_live_response()` silently returns mock data with no signal to the frontend
- [ ] Geometry simplification tolerance (`0.0006` deg) may over-simplify small fires < 500 acres
- [ ] `agency` and `status` fields fetched from CAL FIRE source but not yet surfaced in normalized output

---

## Frontend Contract Notes (for Frontend agents)

- `LiveResponse.overlays[id="fire_perimeters"].data` is a GeoJSON FeatureCollection
- Feature properties match the schema above
- `key_incidents` array in `LiveResponse` is sorted by acres DESC, max 20 items
- When `/api/live` fails entirely, the frontend (`page.tsx`) falls back to `fetchStatus()` + `fetchOverlays()` + `fetchUpdates()` separately

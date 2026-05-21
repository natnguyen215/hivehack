import { z } from 'zod';
import type { FeatureCollection } from 'geojson';
import type {
  GeocodingSuggestion,
  HistoricalIncidentResponse,
  LiveResponse,
  LiveUpdate,
  RouteRequestPayload,
  RouteResponse,
  TravelMode,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const MAX_WAYPOINTS = 25;
const MAX_GEOCODE_CACHE_SIZE = 100;
const MAX_DIRECTIONS_CACHE_SIZE = 50;

type DirectionsResult = {
  coordinates: [number, number][];
  distance_miles: number;
  duration_minutes: number;
};

type MapboxDirectionsResponse = {
  routes?: Array<{
    geometry: {
      coordinates: [number, number][];
    };
    distance: number;
    duration: number;
  }>;
};

type MapboxGeocodingResponse = {
  features?: Array<{
    place_name: string;
    center: [number, number];
  }>;
};

// --- Zod schemas ---

export const StatusResponseSchema = z.object({
  level: z.string(),
  advisory: z.string(),
  active_fires: z.number(),
  active_incidents: z.number().optional(),
  total_incidents: z.number().optional(),
  counties: z.array(z.string()),
  updated_at: z.string(),
  updated: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

const RouteSegmentSchema = z.object({
  name: z.string(),
  distance_miles: z.number(),
  duration_minutes: z.number(),
  risk: z.string(),
});

const RouteGeometrySchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

const FireImpactSchema = z.object({
  blocked: z.boolean(),
  impacted_incidents: z.array(z.string()),
  overlap_segments: z.number().nullable().optional(),
});

const RouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  distance_miles: z.number(),
  duration_minutes: z.number(),
  risk: z.string(),
  segments: z.array(RouteSegmentSchema),
  geometry: RouteGeometrySchema,
});

export const RouteResponseSchema = z.object({
  recommended: RouteSchema,
  alternatives: z.array(RouteSchema),
  fire_impact: FireImpactSchema.nullable().default(null),
});

const FeatureCollectionSchema = z.custom<FeatureCollection>(
  (val) =>
    val !== null &&
    typeof val === 'object' &&
    (val as Record<string, unknown>).type === 'FeatureCollection' &&
    Array.isArray((val as Record<string, unknown>).features),
);

const GeoOverlaySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  data: FeatureCollectionSchema,
});

export const OverlayCollectionSchema = z.object({
  overlays: z.array(GeoOverlaySchema),
});
export type OverlayCollection = z.infer<typeof OverlayCollectionSchema>;

const SeverityLevelSchema = z.enum(['critical', 'high', 'moderate', 'low', 'info']);

const LiveUpdateSchema = z.object({
  id: z.string(),
  category: z.string(),
  severity: SeverityLevelSchema,
  message: z.string(),
  timestamp: z.string(),
});

const KeyIncidentSchema = z.object({
  id: z.string(),
  name: z.string(),
  acres: z.number(),
  severity: z.union([SeverityLevelSchema, z.string()]),
  updated_at: z.string().nullable().optional(),
  display_status: z.string().nullable().optional(),
});

export const LiveResponseSchema = z.object({
  fetched_at: z.string(),
  status: StatusResponseSchema,
  overlays: z.array(GeoOverlaySchema),
  updates: z.array(LiveUpdateSchema),
  key_incidents: z.array(KeyIncidentSchema),
});

export const GeocodingSuggestionSchema = z.object({
  place_name: z.string(),
  center: z.tuple([z.number(), z.number()]),
});
export const GeocodingSuggestionsSchema = z.array(GeocodingSuggestionSchema);

// Internal schemas for remaining endpoints

const HealthSchema = z.object({ status: z.string() });

const HistoricalSnapshotSchema = z.object({
  index: z.number(),
  label: z.string(),
  timestamp: z.string(),
  acres: z.number(),
  geojson: FeatureCollectionSchema,
  routeBlocked: z.boolean(),
  routeName: z.string(),
  routeRisk: z.enum(['low', 'moderate', 'high']),
  routeGeometry: RouteGeometrySchema.optional(),
});

const HistoricalIncidentDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  description: z.string(),
});

const HistoricalIncidentResponseSchema = z.object({
  incident: HistoricalIncidentDetailSchema,
  snapshots: z.array(HistoricalSnapshotSchema),
});

const LiveUpdatesArraySchema = z.array(LiveUpdateSchema);

// ---

const directionsCache = new Map<string, DirectionsResult | null>();
const directionsInFlight = new Map<string, Promise<DirectionsResult | null>>();
const geocodeCache = new Map<string, GeocodingSuggestion[]>();
const geocodeInFlight = new Map<string, Promise<GeocodingSuggestion[]>>();

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

function withTimeout<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  ms = 10000,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), ms);
  return fetchFn(controller.signal).finally(() => clearTimeout(timer));
}

async function handleResponse<T>(
  response: Response,
  url: string,
  schema: { parse(data: unknown): T },
): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  const data: unknown = await response.json();
  try {
    return schema.parse(data);
  } catch {
    throw new Error(`Invalid response from ${url}: response shape does not match expected schema`);
  }
}

export async function fetchHealth(): Promise<{ status: string }> {
  const url = buildUrl('/health');
  const res = await withTimeout((signal) => fetch(url, { signal }));
  return handleResponse(res, url, HealthSchema);
}

export async function fetchStatus(): Promise<StatusResponse> {
  const url = buildUrl('/api/v1/status');
  const res = await withTimeout((signal) => fetch(url, { cache: 'no-store', signal }));
  return handleResponse(res, url, StatusResponseSchema);
}

export async function fetchLiveData(): Promise<LiveResponse> {
  const url = buildUrl('/api/v1/live');
  const res = await withTimeout((signal) => fetch(url, { cache: 'no-store', signal }));
  return handleResponse(res, url, LiveResponseSchema);
}

export async function fetchHistoricalPalisades(): Promise<HistoricalIncidentResponse> {
  const url = buildUrl('/api/v1/history/palisades');
  const res = await withTimeout((signal) => fetch(url, { cache: 'no-store', signal }));
  return handleResponse(res, url, HistoricalIncidentResponseSchema);
}

export async function fetchRoutes(payload: RouteRequestPayload): Promise<RouteResponse> {
  const url = buildUrl('/api/v1/routes');
  const res = await withTimeout((signal) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }),
  );
  return handleResponse(res, url, RouteResponseSchema);
}

export async function fetchOverlays(): Promise<OverlayCollection> {
  const url = buildUrl('/api/v1/overlays');
  const res = await withTimeout((signal) => fetch(url, { cache: 'no-store', signal }));
  return handleResponse(res, url, OverlayCollectionSchema);
}

export async function fetchUpdates(): Promise<LiveUpdate[]> {
  const url = buildUrl('/api/v1/updates');
  const res = await withTimeout((signal) => fetch(url, { cache: 'no-store', signal }));
  return handleResponse(res, url, LiveUpdatesArraySchema);
}

export async function fetchDirections(waypoints: [number, number][], travelMode: TravelMode = 'driving'): Promise<DirectionsResult | null> {
  if (waypoints.length < 2 || !MAPBOX_TOKEN) return null;

  let points = waypoints;
  if (points.length > MAX_WAYPOINTS) {
    const sampled: [number, number][] = [points[0]];
    const step = (points.length - 1) / (MAX_WAYPOINTS - 1);
    for (let i = 1; i < MAX_WAYPOINTS - 1; i += 1) {
      sampled.push(points[Math.round(i * step)]);
    }
    sampled.push(points[points.length - 1]);
    points = sampled;
  }

  const cacheKey = `${travelMode}:${points
    .map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
    .join(';')}`;

  if (directionsCache.has(cacheKey)) {
    return directionsCache.get(cacheKey) ?? null;
  }

  const activeRequest = directionsInFlight.get(cacheKey);
  if (activeRequest) return activeRequest;

  const coords = points.map((coord) => `${coord[0]},${coord[1]}`).join(';');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    geometries: 'geojson',
    overview: 'full',
  });
  const url = `https://api.mapbox.com/directions/v5/mapbox/${travelMode}/${coords}?${params.toString()}`;

  const request = withTimeout(async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const data = (await res.json()) as MapboxDirectionsResponse;
    const route = data.routes?.[0];
    if (!route) return null;

    return {
      coordinates: route.geometry.coordinates,
      distance_miles: Math.round(route.distance * 0.000621371 * 10) / 10,
      duration_minutes: Math.round(route.duration / 60),
    };
  });

  directionsInFlight.set(cacheKey, request);

  try {
    const result = await request;
    setDirectionsCache(cacheKey, result);
    return result;
  } finally {
    directionsInFlight.delete(cacheKey);
  }
}

export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    types: 'place,address',
    limit: '1',
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`;

  const data = await withTimeout(async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as MapboxGeocodingResponse;
  }, 5000);

  return data?.features?.[0]?.place_name ?? null;
}

export async function geocodePlace(query: string): Promise<[number, number] | null> {
  const results = await searchPlaces(query);
  return results.length > 0 ? results[0].center : null;
}

export async function fetchMapboxRoutes(
  origin: [number, number],
  destination: [number, number],
  travelMode: TravelMode = 'driving',
): Promise<DirectionsResult[]> {
  if (!MAPBOX_TOKEN) return [];

  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    geometries: 'geojson',
    overview: 'full',
    alternatives: 'true',
  });
  const url = `https://api.mapbox.com/directions/v5/mapbox/${travelMode}/${coords}?${params.toString()}`;

  const data = await withTimeout(async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as MapboxDirectionsResponse;
  });
  if (!data?.routes) return [];

  return data.routes.map((route) => ({
    coordinates: route.geometry.coordinates,
    distance_miles: Math.round(route.distance * 0.000621371 * 10) / 10,
    duration_minutes: Math.round(route.duration / 60),
  }));
}

/**
 * LRU-aware Map setter. Deleting before re-inserting moves the key to the newest
 * position in Map's insertion order, so `map.keys().next().value` always returns
 * the least-recently-used key for O(1) eviction.
 */
function setDirectionsCache(key: string, value: DirectionsResult | null) {
  if (directionsCache.has(key)) directionsCache.delete(key);
  directionsCache.set(key, value);

  if (directionsCache.size > MAX_DIRECTIONS_CACHE_SIZE) {
    const oldestKey = directionsCache.keys().next().value;
    if (typeof oldestKey === 'string') directionsCache.delete(oldestKey);
  }
}

/** @see setDirectionsCache — same LRU semantics */
function setGeocodeCache(key: string, value: GeocodingSuggestion[]) {
  if (geocodeCache.has(key)) geocodeCache.delete(key);
  geocodeCache.set(key, value);

  if (geocodeCache.size > MAX_GEOCODE_CACHE_SIZE) {
    const oldestKey = geocodeCache.keys().next().value;
    if (typeof oldestKey === 'string') geocodeCache.delete(oldestKey);
  }
}

export async function searchPlaces(query: string, externalSignal?: AbortSignal): Promise<GeocodingSuggestion[]> {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned || !MAPBOX_TOKEN) return [];

  const cached = geocodeCache.get(cleaned);
  if (cached) return cached;

  const inFlight = geocodeInFlight.get(cleaned);
  if (inFlight) return await inFlight;

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'US',
    bbox: '-124.48,32.53,-114.13,42.01',
    types: 'place,address,poi',
    limit: '5',
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json?${params.toString()}`;

  const request = withTimeout(
    async (signal) => {
      const res = await fetch(url, { signal });
      if (!res.ok) return [];

      const data = (await res.json()) as MapboxGeocodingResponse;
      return (data.features ?? []).map((feature) => ({
        place_name: feature.place_name,
        center: feature.center,
      }));
    },
    5000,
    externalSignal,
  );

  geocodeInFlight.set(cleaned, request);

  try {
    const result = await request;
    setGeocodeCache(cleaned, result);
    return result;
  } catch (error) {
    if ((error as Error).name === 'AbortError') return [];
    throw error;
  } finally {
    geocodeInFlight.delete(cleaned);
  }
}


import type {
  GeocodingSuggestion,
  HistoricalIncidentResponse,
  LiveUpdate,
  LiveResponse,
  OverlaysResponse,
  RouteRequestPayload,
  RouteResponse,
  TravelMode,
  WildfireStatus,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const MAX_WAYPOINTS = 25;
const MAX_GEOCODE_CACHE_SIZE = 100;

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

const directionsCache = new Map<string, DirectionsResult | null>();
const directionsInFlight = new Map<string, Promise<DirectionsResult | null>>();
const geocodeCache = new Map<string, GeocodingSuggestion[]>();
const geocodeInFlight = new Map<string, Promise<GeocodingSuggestion[]>>();

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(buildUrl('/health'));
  return handleResponse(res);
}

export async function fetchStatus(): Promise<WildfireStatus> {
  const res = await fetch(buildUrl('/api/status'), { cache: 'no-store' });
  return handleResponse(res);
}

export async function fetchLiveData(): Promise<LiveResponse> {
  const res = await fetch(buildUrl('/api/live'), { cache: 'no-store' });
  return handleResponse(res);
}

export async function fetchHistoricalPalisades(): Promise<HistoricalIncidentResponse> {
  const res = await fetch(buildUrl('/api/history/palisades'), { cache: 'no-store' });
  return handleResponse(res);
}

export async function fetchRoutes(payload: RouteRequestPayload): Promise<RouteResponse> {
  const res = await fetch(buildUrl('/api/routes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchOverlays(): Promise<OverlaysResponse> {
  const res = await fetch(buildUrl('/api/overlays'), { cache: 'no-store' });
  return handleResponse(res);
}

export async function fetchUpdates(): Promise<LiveUpdate[]> {
  const res = await fetch(buildUrl('/api/updates'), { cache: 'no-store' });
  return handleResponse(res);
}

/**
 * Snap waypoints to roads and return dense route geometry + summary metrics.
 */
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

  const request = (async (): Promise<DirectionsResult | null> => {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as MapboxDirectionsResponse;
    const route = data.routes?.[0];
    if (!route) return null;

    return {
      coordinates: route.geometry.coordinates,
      distance_miles: Math.round(route.distance * 0.000621371 * 10) / 10,
      duration_minutes: Math.round(route.duration / 60),
    };
  })();

  directionsInFlight.set(cacheKey, request);

  try {
    const result = await request;
    directionsCache.set(cacheKey, result);
    return result;
  } finally {
    directionsInFlight.delete(cacheKey);
  }
}

/**
 * Geocode a place name to coordinates. Returns null if no match.
 */
export async function geocodePlace(query: string): Promise<[number, number] | null> {
  const results = await searchPlaces(query);
  return results.length > 0 ? results[0].center : null;
}

/**
 * Fetch real routes (with alternatives) between an origin and destination.
 * Uses Mapbox Directions API directly — no backend needed.
 */
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

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as MapboxDirectionsResponse;
  if (!data.routes) return [];

  return data.routes.map((route) => ({
    coordinates: route.geometry.coordinates,
    distance_miles: Math.round(route.distance * 0.000621371 * 10) / 10,
    duration_minutes: Math.round(route.duration / 60),
  }));
}

function setGeocodeCache(key: string, value: GeocodingSuggestion[]) {
  if (geocodeCache.has(key)) geocodeCache.delete(key);
  geocodeCache.set(key, value);

  if (geocodeCache.size > MAX_GEOCODE_CACHE_SIZE) {
    const oldestKey = geocodeCache.keys().next().value;
    if (typeof oldestKey === 'string') geocodeCache.delete(oldestKey);
  }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodingSuggestion[]> {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned || !MAPBOX_TOKEN) return [];

  const cached = geocodeCache.get(cleaned);
  if (cached) return cached;

  const inFlight = geocodeInFlight.get(cleaned);
  if (inFlight) return inFlight;

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'US',
    bbox: '-124.48,32.53,-114.13,42.01',
    types: 'place,address,poi',
    limit: '5',
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json?${params.toString()}`;

  const request = (async (): Promise<GeocodingSuggestion[]> => {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];

    const data = (await res.json()) as MapboxGeocodingResponse;
    return (data.features ?? []).map((feature) => ({
      place_name: feature.place_name,
      center: feature.center,
    }));
  })();

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

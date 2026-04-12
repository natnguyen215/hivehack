export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low' | 'info';
export type DataMode = 'live' | 'fallback' | 'historical';
export type MapStyle = 'grayscale' | 'streets';
export type TravelMode = 'driving' | 'walking';

export interface WildfireStatus {
  level: string;
  advisory: string;
  active_fires: number;
  active_incidents?: number;
  total_incidents?: number;
  counties: string[];
  updated_at: string;
  updated?: string;
  updatedAt?: string;
}

export interface RouteSegment {
  name: string;
  distance_miles: number;
  duration_minutes: number;
  risk: string;
}

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface Route {
  id: string;
  name: string;
  distance_miles: number;
  duration_minutes: number;
  risk: string;
  segments: RouteSegment[];
  geometry: RouteGeometry;
}

export interface RouteResponse {
  recommended: Route;
  alternatives: Route[];
  fire_impact?: FireImpact | null;
}

export interface GeoOverlay {
  id: string;
  name: string;
  category: string;
  data: GeoJSON.FeatureCollection;
}

export interface OverlaysResponse {
  overlays: GeoOverlay[];
}

export interface LiveUpdate {
  id: string;
  category: string;
  severity: SeverityLevel;
  message: string;
  timestamp: string;
}

export interface KeyIncident {
  id: string;
  name: string;
  acres: number;
  severity: SeverityLevel | string;
  updated_at?: string | null;
  display_status?: string | null;
}

export interface LiveResponse {
  fetched_at: string;
  status: WildfireStatus;
  overlays: GeoOverlay[];
  updates: LiveUpdate[];
  key_incidents: KeyIncident[];
}

export interface FireImpact {
  blocked: boolean;
  impacted_incidents: string[];
  overlap_segments?: number | null;
}

export interface RouteRequestPayload {
  origin: string | [number, number];
  destination: string | [number, number];
  overlays: string[];
  timestamp?: string;
  mode?: DataMode;
}

export interface GeocodingSuggestion {
  place_name: string;
  center: [number, number];
}

export interface FireSnapshot {
  index: number;
  label: string;
  timestamp?: string;
  acres?: number;
  geojson: GeoJSON.FeatureCollection;
  routeBlocked: boolean;
  routeGeometry?: RouteGeometry;
  routeName: string;
  routeRisk: 'low' | 'moderate' | 'high';
}

export interface HistoricalIncident {
  id: string;
  name: string;
  start_at: string;
  end_at: string;
  description: string;
}

export interface HistoricalSnapshot {
  index: number;
  label: string;
  timestamp: string;
  acres: number;
  geojson: GeoJSON.FeatureCollection;
  routeBlocked: boolean;
  routeName: string;
  routeRisk: 'low' | 'moderate' | 'high';
  routeGeometry?: RouteGeometry;
}

export interface HistoricalIncidentResponse {
  incident: HistoricalIncident;
  snapshots: HistoricalSnapshot[];
}

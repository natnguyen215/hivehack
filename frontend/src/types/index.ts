export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low' | 'info';

export interface WildfireStatus {
  level: string;
  advisory: string;
  active_fires: number;
  counties: string[];
  updated_at: string;
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

export interface RouteRequestPayload {
  origin: [number, number];       // [lng, lat]
  destination?: [number, number]; // [lng, lat] — backend defaults to Santa Barbara
  overlays: string[];
  timestamp?: string;             // fire snapshot label, e.g. "Jan 7 · 06:00"
}

export interface FireSnapshot {
  index: number;
  label: string;
  geojson: GeoJSON.FeatureCollection;
  routeBlocked: boolean;
  routeGeometry: RouteGeometry;
  routeName: string;
  routeRisk: 'low' | 'moderate' | 'high';
}

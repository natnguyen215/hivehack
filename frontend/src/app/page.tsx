'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Sidebar from '@/components/Sidebar';
import StatusBanner from '@/components/StatusBanner';
import {
  fetchDirections,
  fetchHistoricalPalisades,
  fetchLiveData,
  fetchMapboxRoutes,
  fetchOverlays,
  fetchRoutes,
  fetchStatus,
  fetchUpdates,
  geocodePlace,
} from '@/lib/api';
import { FIRE_SNAPSHOTS } from '@/lib/fire-timeline';
import type {
  DataMode,
  FireSnapshot,
  GeoOverlay,
  HistoricalIncident,
  HistoricalSnapshot,
  KeyIncident,
  LiveUpdate,
  MapStyle,
  Route,
  RouteGeometry,
  RouteResponse,
  TravelMode,
  WildfireStatus,
} from '@/types';

type FlyTarget = {
  bounds: [number, number, number, number];
  key: number;
};

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
const TimelineSlider = dynamic(() => import('@/components/TimelineSlider'), { ssr: false });

const DEFAULT_ORIGIN = 'Los Angeles, CA';
const DEFAULT_OVERLAYS = ['fire_perimeters'] as const;
const FALLBACK_HISTORICAL_INCIDENT: HistoricalIncident = {
  id: 'FS_Palisades_2025_CALFD_000738',
  name: 'Palisades Fire (Historical Replay)',
  start_at: '2025-01-07T06:00:00Z',
  end_at: '2025-02-04T23:59:00Z',
  description: 'Deterministic replay snapshots for pitch demonstrations and timeline storytelling.',
};

const headerGradient = {
  background:
    'linear-gradient(to bottom, rgba(7,10,18,0.95) 0%, rgba(7,10,18,0.72) 48%, rgba(7,10,18,0) 100%)',
};
const footerGradient = {
  background:
    'linear-gradient(to top, rgba(7,10,18,0.95) 0%, rgba(7,10,18,0.7) 52%, rgba(7,10,18,0) 100%)',
};

type TimelineRouteTemplate = {
  id: string;
  name: string;
  duration_minutes: number;
  distance_miles: number;
  risk: Route['risk'];
  coordinates: [number, number][];
};

const HISTORICAL_ROUTE_TEMPLATES: Record<'clear' | 'blocked', TimelineRouteTemplate[]> = {
  clear: [
    {
      id: 'timeline-route-1',
      name: 'US-101 Coastal',
      distance_miles: 92.4,
      duration_minutes: 108,
      risk: 'low',
      coordinates: [
        [-118.2437, 34.0522], // Downtown LA
        [-118.3950, 34.0180], // I-10 at La Cienega
        [-118.4725, 34.0280], // I-10 / I-405 junction
        [-118.5180, 34.0390], // near Pacific Palisades on US-101
        [-118.6010, 34.0460], // US-101 Malibu junction
        [-118.8070, 34.1530], // US-101 at Camarillo Springs
        [-119.0400, 34.2160], // US-101 Ventura
        [-119.2290, 34.2750], // US-101 past Ventura
        [-119.6982, 34.4208], // Santa Barbara
      ],
    },
    {
      id: 'timeline-route-2',
      name: 'US-101 via Hollywood',
      distance_miles: 98.1,
      duration_minutes: 115,
      risk: 'low',
      coordinates: [
        [-118.2437, 34.0522], // Downtown LA
        [-118.3260, 34.1020], // US-101 Hollywood
        [-118.3910, 34.1380], // US-101 Sherman Oaks
        [-118.5010, 34.1590], // US-101 Encino / Tarzana
        [-118.6060, 34.1710], // US-101 Woodland Hills
        [-118.7940, 34.2070], // US-101 Thousand Oaks
        [-119.0400, 34.2160], // US-101 Ventura
        [-119.6982, 34.4208], // Santa Barbara
      ],
    },
    {
      id: 'timeline-route-3',
      name: 'I-405 N to US-101',
      distance_miles: 110.7,
      duration_minutes: 135,
      risk: 'moderate',
      coordinates: [
        [-118.2437, 34.0522], // Downtown LA
        [-118.3950, 34.0180], // I-10 at La Cienega
        [-118.4725, 34.0280], // I-10 / I-405 interchange
        [-118.4690, 34.0890], // I-405 at Getty Center
        [-118.4700, 34.1560], // I-405 / US-101 junction (Sherman Oaks)
        [-118.6060, 34.1710], // US-101 Woodland Hills
        [-118.7940, 34.2070], // US-101 Thousand Oaks
        [-119.0400, 34.2160], // US-101 Ventura
        [-119.6982, 34.4208], // Santa Barbara
      ],
    },
  ],
  blocked: [
    {
      id: 'timeline-route-1',
      name: 'I-405 N to US-101 W',
      distance_miles: 115.9,
      duration_minutes: 130,
      risk: 'moderate',
      coordinates: [
        [-118.2437, 34.0522], // Downtown LA
        [-118.3780, 34.0290], // I-10 heading west
        [-118.4725, 34.0280], // I-10 / I-405 interchange
        [-118.4690, 34.0890], // I-405 at Getty Center / Sepulveda Pass
        [-118.4700, 34.1560], // I-405 / US-101 junction (Sherman Oaks)
        [-118.6060, 34.1710], // US-101 Woodland Hills
        [-118.7940, 34.2070], // US-101 Thousand Oaks
        [-119.0400, 34.2160], // US-101 Ventura
        [-119.2290, 34.2750], // US-101 past Ventura
        [-119.6982, 34.4208], // Santa Barbara
      ],
    },
    {
      id: 'timeline-route-2',
      name: 'I-5 N to CA-126 W',
      distance_miles: 118.5,
      duration_minutes: 142,
      risk: 'moderate',
      coordinates: [
        [-118.2437, 34.0522], // Downtown LA
        [-118.2460, 34.1060], // I-5 at Los Feliz
        [-118.2556, 34.1478], // I-5 at Glendale
        [-118.3200, 34.2580], // I-5 at Newhall / Santa Clarita
        [-118.3870, 34.2870], // CA-126 junction near Castaic
        [-118.6300, 34.3080], // CA-126 at Fillmore
        [-118.8820, 34.2830], // CA-126 at Santa Paula
        [-119.0400, 34.2160], // US-101 Ventura
        [-119.6982, 34.4208], // Santa Barbara
      ],
    },
    {
      id: 'timeline-route-3',
      name: 'CA-14 N to I-5 W',
      distance_miles: 131.2,
      duration_minutes: 158,
      risk: 'high',
      coordinates: [
        [-118.2437, 34.0522], // Downtown LA
        [-118.2460, 34.1060], // I-5 at Los Feliz
        [-118.2556, 34.1478], // I-5 at Glendale
        [-118.1880, 34.2190], // CA-14 junction at I-5
        [-118.1510, 34.3440], // CA-14 at Agua Dulce
        [-118.2900, 34.3870], // CA-14 / I-5 reconnect near Santa Clarita
        [-118.6300, 34.3080], // CA-126 at Fillmore
        [-118.8820, 34.2830], // CA-126 at Santa Paula
        [-119.0400, 34.2160], // US-101 Ventura
        [-119.6982, 34.4208], // Santa Barbara
      ],
    },
  ],
};

function formatSnapshotLabel(label: string, timestamp: string, fallbackIndex: number): string {
  if (label.includes(' - ')) return label;

  const date = new Date(timestamp);
  if (!Number.isNaN(date.getTime())) {
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const time = date.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return `${month} ${day} - ${time}`;
  }

  return label || `Snapshot ${fallbackIndex + 1}`;
}

function extractOverlay(overlays: GeoOverlay[], id: string): GeoJSON.FeatureCollection | null {
  const overlay = overlays.find((o) => o.id === id);
  return (overlay?.data as GeoJSON.FeatureCollection) ?? null;
}

function normalizeHistoricalSnapshots(snapshots: HistoricalSnapshot[]): FireSnapshot[] {
  return [...snapshots]
    .sort((a, b) => a.index - b.index)
    .map((snapshot, index) => ({
      index: snapshot.index ?? index,
      label: formatSnapshotLabel(snapshot.label, snapshot.timestamp, index),
      timestamp: snapshot.timestamp,
      acres: snapshot.acres,
      geojson: snapshot.geojson,
      routeBlocked: snapshot.routeBlocked,
      routeName: snapshot.routeName,
      routeRisk: snapshot.routeRisk,
      routeGeometry: snapshot.routeGeometry,
    }));
}

function buildHistoricalRouteData(
  snapshot: FireSnapshot,
  snapped: Record<string, RouteGeometry>,
): RouteResponse {
  const variant = snapshot.routeBlocked ? 'blocked' : 'clear';
  const templates = HISTORICAL_ROUTE_TEMPLATES[variant];

  const routes = templates.map((template, index) => {
    let geometry: RouteGeometry;
    if (index === 0) {
      geometry = snapped[`snapshot-${snapshot.index}`]
        ?? (snapshot.routeGeometry
          ? (snapped[template.id] ?? snapshot.routeGeometry)
          : (snapped[template.id] ?? { type: 'LineString', coordinates: template.coordinates }));
    } else {
      geometry = snapped[template.id] ?? { type: 'LineString', coordinates: template.coordinates };
    }

    return {
      id: template.id,
      name: index === 0 ? snapshot.routeName : template.name,
      distance_miles: template.distance_miles,
      duration_minutes: template.duration_minutes,
      risk: index === 0 ? snapshot.routeRisk : template.risk,
      segments: [],
      geometry,
    };
  });

  return {
    recommended: routes[0],
    alternatives: routes.slice(1),
  };
}

export default function HomePage() {
  const [mode, setMode] = useState<DataMode>('live');
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(DEFAULT_OVERLAYS));
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [statusData, setStatusData] = useState<WildfireStatus | null>(null);
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [keyIncidents, setKeyIncidents] = useState<KeyIncident[]>([]);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string | null>(null);
  const [liveFireOverride, setLiveFireOverride] = useState<GeoJSON.FeatureCollection | null>(null);
  const [liveEvacData, setLiveEvacData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [liveSmokeData, setLiveSmokeData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [historicalIncident, setHistoricalIncident] = useState<HistoricalIncident | null>(
    FALLBACK_HISTORICAL_INCIDENT,
  );
  const [historicalSnapshots, setHistoricalSnapshots] = useState<FireSnapshot[]>(FIRE_SNAPSHOTS);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState<MapStyle>('grayscale');
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [snappedTemplates, setSnappedTemplates] = useState<Record<string, RouteGeometry>>({});

  const activeSnapshot = historicalSnapshots[timelineIndex] ?? historicalSnapshots[0] ?? null;

  const loadLive = useCallback(async () => {
    setRefreshingLive(true);
    try {
      const live = await fetchLiveData();
      setStatusData(live.status);
      setUpdates(live.updates);
      setKeyIncidents(live.key_incidents);
      setLiveFetchedAt(live.fetched_at);
      setLiveFireOverride(extractOverlay(live.overlays, 'fire_perimeters'));
      setLiveEvacData(extractOverlay(live.overlays, 'evacuation_zones'));
      setLiveSmokeData(extractOverlay(live.overlays, 'smoke_plumes'));
    } catch {
      const [statusResult, updatesResult, overlaysResult] = await Promise.allSettled([
        fetchStatus(),
        fetchUpdates(),
        fetchOverlays(),
      ]);

      if (statusResult.status === 'fulfilled') {
        setStatusData(statusResult.value);
      }
      if (updatesResult.status === 'fulfilled') {
        setUpdates(updatesResult.value);
      }
      if (overlaysResult.status === 'fulfilled') {
        const overlays = overlaysResult.value.overlays;
        setLiveFireOverride(extractOverlay(overlays, 'fire_perimeters'));
        setLiveEvacData(extractOverlay(overlays, 'evacuation_zones'));
        setLiveSmokeData(extractOverlay(overlays, 'smoke_plumes'));
      } else {
        setLiveFireOverride(null);
        setLiveEvacData(null);
        setLiveSmokeData(null);
      }

      setKeyIncidents([]);
      setLiveFetchedAt(new Date().toISOString());
    } finally {
      setRefreshingLive(false);
    }
  }, []);

  const loadHistorical = useCallback(async () => {
    try {
      const historical = await fetchHistoricalPalisades();
      const snapshots = normalizeHistoricalSnapshots(historical.snapshots);
      setHistoricalIncident(historical.incident);
      setHistoricalSnapshots(snapshots.length > 0 ? snapshots : FIRE_SNAPSHOTS);
    } catch {
      setHistoricalIncident(FALLBACK_HISTORICAL_INCIDENT);
      setHistoricalSnapshots(FIRE_SNAPSHOTS);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.all([loadLive(), loadHistorical()]);
    })();
  }, [loadHistorical, loadLive]);

  // Snap all historical route template waypoints to real roads on mount.
  useEffect(() => {
    let cancelled = false;

    async function snapTemplates() {
      const allTemplates = [
        ...HISTORICAL_ROUTE_TEMPLATES.clear,
        ...HISTORICAL_ROUTE_TEMPLATES.blocked,
      ];

      // Deduplicate by coordinate key to avoid redundant API calls
      const seen = new Map<string, string[]>();
      for (const t of allTemplates) {
        const key = JSON.stringify(t.coordinates);
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key)!.push(t.id);
      }

      const results: Record<string, RouteGeometry> = {};

      // Also snap each snapshot's primary route geometry
      const snapshotCoords = new Map<string, number[]>();
      for (const snap of historicalSnapshots) {
        if (!snap.routeGeometry?.coordinates) continue;
        const key = JSON.stringify(snap.routeGeometry.coordinates);
        if (!snapshotCoords.has(key)) snapshotCoords.set(key, []);
        snapshotCoords.get(key)!.push(snap.index);
      }

      await Promise.all([
        ...Array.from(seen.entries()).map(async ([key, ids]) => {
          const coords = JSON.parse(key) as [number, number][];
          const dir = await fetchDirections(coords);
          if (dir && !cancelled) {
            const geom: RouteGeometry = { type: 'LineString', coordinates: dir.coordinates };
            for (const id of ids) {
              results[id] = geom;
            }
          }
        }),
        ...Array.from(snapshotCoords.entries()).map(async ([key, indices]) => {
          const coords = JSON.parse(key) as [number, number][];
          const dir = await fetchDirections(coords);
          if (dir && !cancelled) {
            const geom: RouteGeometry = { type: 'LineString', coordinates: dir.coordinates };
            for (const idx of indices) {
              results[`snapshot-${idx}`] = geom;
            }
          }
        }),
      ]);

      if (!cancelled) setSnappedTemplates(results);
    }

    snapTemplates();
    return () => { cancelled = true; };
  }, [historicalSnapshots]);

  useEffect(() => {
    setTimelineIndex((current) => {
      if (historicalSnapshots.length === 0) return 0;
      return Math.min(current, historicalSnapshots.length - 1);
    });
  }, [historicalSnapshots.length]);

  const handleOriginChange = useCallback((value: string, coords?: [number, number]) => {
    setOrigin(value);
    setOriginCoords(coords ?? null);
  }, []);

  const handleDestinationChange = useCallback((value: string, coords?: [number, number]) => {
    setDestination(value);
    setDestCoords(coords ?? null);
  }, []);

  const handleFireClick = useCallback(
    (incidentName: string) => {
      const fireData = mode === 'historical' ? activeSnapshot?.geojson : liveFireOverride;
      if (!fireData) return;

      const nameKeys = ['name', 'incident_name', 'incident', 'poly_IncidentName', 'FIRE_NAME'];
      const matching = fireData.features.filter((f) => {
        const props = f.properties ?? {};
        return nameKeys.some(
          (k) =>
            typeof props[k] === 'string' &&
            props[k].toLowerCase().includes(incidentName.toLowerCase()),
        );
      });

      if (matching.length === 0) return;

      const subset: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: matching,
      };

      // Compute bounds
      let west = Infinity,
        south = Infinity,
        east = -Infinity,
        north = -Infinity;
      for (const feature of subset.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        let rings: number[][][] = [];
        if (geom.type === 'Polygon') rings = (geom as GeoJSON.Polygon).coordinates;
        else if (geom.type === 'MultiPolygon')
          rings = (geom as GeoJSON.MultiPolygon).coordinates.flat();
        for (const ring of rings) {
          for (const [lng, lat] of ring) {
            if (lng < west) west = lng;
            if (lng > east) east = lng;
            if (lat < south) south = lat;
            if (lat > north) north = lat;
          }
        }
      }

      if (!Number.isFinite(west)) return;

      setFlyTarget((prev) => ({
        bounds: [west, south, east, north],
        key: (prev?.key ?? 0) + 1,
      }));
    },
    [mode, activeSnapshot, liveFireOverride],
  );

  const handleToggleOverlay = useCallback((overlayId: string) => {
    setActiveOverlays((previous) => {
      const next = new Set(previous);
      if (next.has(overlayId)) {
        next.delete(overlayId);
      } else {
        next.add(overlayId);
      }
      return next;
    });
  }, []);

  const handleRouteRequest = useCallback(async () => {
    if (mode !== 'live') return;
    if (!origin.trim() || !destination.trim()) return;

    setLoadingRoute(true);
    setRouteError(null);
    try {
      // Resolve coordinates for origin and destination
      const resolvedOrigin = originCoords ?? (await geocodePlace(origin));
      const resolvedDest = destCoords ?? (await geocodePlace(destination));

      if (!resolvedOrigin || !resolvedDest) {
        setRouteData(null);
        return;
      }

      // Get real routes from Mapbox Directions API
      const mapboxRoutes = await fetchMapboxRoutes(resolvedOrigin, resolvedDest, travelMode);
      if (mapboxRoutes.length === 0) {
        setRouteData(null);
        return;
      }

      const riskLevels: Array<Route['risk']> = ['low', 'moderate', 'high'];
      const routes: Route[] = mapboxRoutes.map((route, index) => ({
        id: `route-${index}`,
        name: index === 0 ? 'Fastest Route' : `Alternative ${index}`,
        distance_miles: route.distance_miles,
        duration_minutes: route.duration_minutes,
        risk: riskLevels[Math.min(index, riskLevels.length - 1)],
        segments: [],
        geometry: { type: 'LineString' as const, coordinates: route.coordinates },
      }));

      // Check fire impact via backend if fire perimeters overlay is active
      let fireImpact = undefined;
      if (activeOverlays.has('fire_perimeters')) {
        try {
          const backendResponse = await fetchRoutes({
            origin: resolvedOrigin,
            destination: resolvedDest,
            overlays: Array.from(activeOverlays),
            timestamp: new Date().toISOString(),
            mode: 'live',
          });
          fireImpact = backendResponse.fire_impact;
        } catch {
          // Fire impact check failed — continue without it
        }
      }

      const response: RouteResponse = {
        recommended: routes[0],
        alternatives: routes.slice(1),
        fire_impact: fireImpact,
      };

      setRouteData(response);
      setSelectedRouteId(response.recommended.id);
    } catch {
      setRouteData(null);
      setRouteError('Could not find routes. Check your connection and try again.');
    } finally {
      setLoadingRoute(false);
    }
  }, [activeOverlays, destination, destCoords, mode, origin, originCoords, travelMode]);

  const historicalRouteData = useMemo(
    () => (activeSnapshot ? buildHistoricalRouteData(activeSnapshot, snappedTemplates) : null),
    [activeSnapshot, snappedTemplates],
  );

  const displayRouteData = mode === 'historical' ? historicalRouteData : routeData;

  useEffect(() => {
    const defaultRouteId = displayRouteData?.recommended.id;
    if (!defaultRouteId) return;

    const availableIds = new Set([
      defaultRouteId,
      ...displayRouteData.alternatives.map((route) => route.id),
    ]);

    if (!selectedRouteId || !availableIds.has(selectedRouteId)) {
      setSelectedRouteId(defaultRouteId);
    }
  }, [displayRouteData, selectedRouteId]);

  const routeGeometry = useMemo(() => {
    if (!displayRouteData) return null;
    if (!selectedRouteId || displayRouteData.recommended.id === selectedRouteId) {
      return displayRouteData.recommended.geometry;
    }

    const selectedAlternative = displayRouteData.alternatives.find((route) => route.id === selectedRouteId);
    return selectedAlternative?.geometry ?? displayRouteData.recommended.geometry;
  }, [displayRouteData, selectedRouteId]);

  const allRoutes = useMemo(() => {
    if (!displayRouteData) return [];

    const routes = [displayRouteData.recommended, ...displayRouteData.alternatives];
    return routes.map((route) => ({
      id: route.id,
      geometry: route.geometry,
      selected: route.id === selectedRouteId,
    }));
  }, [displayRouteData, selectedRouteId]);

  const mapFireOverride = mode === 'historical' ? activeSnapshot?.geojson ?? null : liveFireOverride;
  const routeBlocked =
    mode === 'historical' ? Boolean(activeSnapshot?.routeBlocked) : Boolean(routeData?.fire_impact?.blocked);
  const sidebarBottomClass = mode === 'historical' ? 'bottom-28' : 'bottom-3';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_18%_16%,rgba(249,115,22,0.2),transparent_34%),radial-gradient(circle_at_82%_84%,rgba(59,130,246,0.12),transparent_30%),#070a12]">
      <header className="absolute left-0 right-0 top-0 z-30 flex items-center gap-4 px-4 pb-8 pt-3" style={headerGradient}>
        <button
          type="button"
          onClick={() => setSidebarOpen((open) => !open)}
          className="flex-shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/10 hover:text-white"
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-300/30 bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight text-white">
              Ember<span className="text-orange-300">Path</span>
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
              Fire-safe navigation
            </p>
          </div>
        </div>

        <div className="ml-auto flex-shrink-0">
          {mode === 'live' ? (
            <StatusBanner status={statusData} updates={updates} />
          ) : (
            <div className="rounded-xl border border-white/15 bg-black/35 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Historical Showcase</p>
              <p className="text-xs font-semibold text-white">{historicalIncident?.name ?? 'Palisades Fire'}</p>
            </div>
          )}
        </div>
      </header>

      <div className="absolute inset-0">
        <MapView
          mode={mode}
          activeOverlays={activeOverlays}
          routeGeometry={routeGeometry}
          allRoutes={allRoutes}
          fireOverride={mapFireOverride}
          evacuationData={liveEvacData}
          smokeData={liveSmokeData}
          routeBlocked={routeBlocked}
          mapStyle={mapStyle}
          flyTo={flyTarget}
        />
        <button
          type="button"
          onClick={() => setMapStyle((s) => (s === 'grayscale' ? 'streets' : 'grayscale'))}
          className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs font-medium text-slate-200 shadow-lg backdrop-blur-sm transition hover:bg-black/80 hover:text-white"
          aria-label="Toggle map style"
        >
          {mapStyle === 'grayscale' ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
              Streets
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2v20M2 12h20" />
              </svg>
              Grayscale
            </>
          )}
        </button>
      </div>

      <div
        className={`absolute left-4 top-[72px] z-20 w-[370px] ${sidebarBottomClass} transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)]'
        }`}
      >
        <div className="h-full">
          <Sidebar
            origin={origin}
            destination={destination}
            onOriginChange={handleOriginChange}
            onDestinationChange={handleDestinationChange}
            activeOverlays={activeOverlays}
            onToggle={handleToggleOverlay}
            routeData={displayRouteData}
            loading={mode === 'live' ? loadingRoute : false}
            onSubmit={handleRouteRequest}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            mode={mode}
            onModeChange={setMode}
            travelMode={travelMode}
            onTravelModeChange={setTravelMode}
            onRefreshLiveData={() => {
              void loadLive();
            }}
            refreshingLiveData={refreshingLive}
            liveLastUpdated={liveFetchedAt}
            keyIncidents={keyIncidents}
            onFireClick={handleFireClick}
            fireImpact={mode === 'live' ? routeData?.fire_impact ?? null : null}
            routeError={mode === 'live' ? routeError : null}
            historicalNarrative={{
              title: historicalIncident?.name ?? 'Palisades fire progression',
              summary: historicalIncident?.description ?? 'Historical snapshots for narrative walkthrough.',
              timestampLabel: activeSnapshot?.label,
              routeNarrative: activeSnapshot?.routeBlocked
                ? activeSnapshot?.routeName
                  ? `Primary route blocked. Rerouting via ${activeSnapshot.routeName}.`
                  : 'Primary route blocked. A safer alternate path is highlighted.'
                : activeSnapshot?.routeName
                  ? `Primary route remains open via ${activeSnapshot.routeName}.`
                  : undefined,
            }}
          />
        </div>
      </div>

      {mode === 'historical' && historicalSnapshots.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-3 pt-8" style={footerGradient}>
          <TimelineSlider snapshots={historicalSnapshots} activeIndex={timelineIndex} onChange={setTimelineIndex} />
        </div>
      )}
    </div>
  );
}



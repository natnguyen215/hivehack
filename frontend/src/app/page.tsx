'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Sidebar from '@/components/Sidebar';
import StatusBanner from '@/components/StatusBanner';
import {
  fetchDirections,
  fetchHistoricalPalisades,
  fetchLiveData,
  fetchOverlays,
  fetchRoutes,
  fetchStatus,
  fetchUpdates,
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
  MapTheme,
  Route,
  RouteGeometry,
  RouteResponse,
  WildfireStatus,
} from '@/types';

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
        [-118.2437, 34.0522],
        [-118.48, 34.06],
        [-119.2965, 34.2819],
        [-119.6982, 34.4208],
      ],
    },
    {
      id: 'timeline-route-2',
      name: 'US-101 via Ventura',
      distance_miles: 98.1,
      duration_minutes: 115,
      risk: 'low',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.32, 34.09],
        [-118.75, 34.31],
        [-119.2965, 34.2819],
        [-119.6982, 34.4208],
      ],
    },
    {
      id: 'timeline-route-3',
      name: 'CA-1 Coastal Route',
      distance_miles: 110.7,
      duration_minutes: 135,
      risk: 'moderate',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.6, 34.04],
        [-118.91, 34.1],
        [-119.2965, 34.2819],
        [-119.6982, 34.4208],
      ],
    },
  ],
  blocked: [
    {
      id: 'timeline-route-1',
      name: 'I-405 N to US-101 N',
      distance_miles: 102.3,
      duration_minutes: 124,
      risk: 'moderate',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.39, 34.07],
        [-118.46, 34.16],
        [-118.55, 34.27],
        [-118.72, 34.28],
        [-119.2965, 34.2819],
        [-119.6982, 34.4208],
      ],
    },
    {
      id: 'timeline-route-2',
      name: 'I-5 N via Grapevine',
      distance_miles: 118.5,
      duration_minutes: 142,
      risk: 'moderate',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.24, 34.24],
        [-118.36, 34.44],
        [-118.62, 34.53],
        [-119.2965, 34.2819],
        [-119.6982, 34.4208],
      ],
    },
    {
      id: 'timeline-route-3',
      name: 'CA-14 N to I-5',
      distance_miles: 131.2,
      duration_minutes: 158,
      risk: 'high',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.17, 34.26],
        [-118.14, 34.47],
        [-118.55, 34.52],
        [-119.2965, 34.2819],
        [-119.6982, 34.4208],
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

function extractFireOverlay(overlays: GeoOverlay[]): GeoJSON.FeatureCollection | null {
  const fireOverlay = overlays.find((overlay) => overlay.id === 'fire_perimeters');
  return fireOverlay?.data ?? null;
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
    // For the primary route (index 0), prefer the snapped snapshot geometry
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
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');
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
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [historicalIncident, setHistoricalIncident] = useState<HistoricalIncident | null>(
    FALLBACK_HISTORICAL_INCIDENT,
  );
  const [historicalSnapshots, setHistoricalSnapshots] = useState<FireSnapshot[]>(FIRE_SNAPSHOTS);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      setLiveFireOverride(extractFireOverlay(live.overlays));
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
        setLiveFireOverride(extractFireOverlay(overlaysResult.value.overlays));
      } else {
        setLiveFireOverride(null);
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
        // Snap template routes
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
        // Snap snapshot primary routes (keyed as "snapshot-{index}")
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
    try {
      const response = await fetchRoutes({
        origin: originCoords ?? origin,
        destination: destCoords ?? destination,
        overlays: Array.from(activeOverlays),
        timestamp: new Date().toISOString(),
        mode: 'live',
      });

      const routeOptions = [response.recommended, ...response.alternatives];
      await Promise.all(
        routeOptions.map(async (routeOption) => {
          const coordinates = routeOption.geometry.coordinates;
          if (coordinates.length < 2) return;

          const directions = await fetchDirections(coordinates);
          if (!directions) return;

          routeOption.geometry = {
            type: 'LineString',
            coordinates: directions.coordinates,
          };
          routeOption.distance_miles = directions.distance_miles;
          routeOption.duration_minutes = directions.duration_minutes;
        }),
      );

      setRouteData(response);
      setSelectedRouteId(response.recommended.id);
    } catch {
      setRouteData(null);
    } finally {
      setLoadingRoute(false);
    }
  }, [activeOverlays, destination, destCoords, mode, origin, originCoords]);

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

      <div className={`absolute inset-0 map-theme-${mapTheme}`}>
        <MapView
          mode={mode}
          activeOverlays={activeOverlays}
          routeGeometry={routeGeometry}
          allRoutes={allRoutes}
          fireOverride={mapFireOverride}
          routeBlocked={routeBlocked}
        />
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
            mapTheme={mapTheme}
            onMapThemeChange={setMapTheme}
            onRefreshLiveData={() => {
              void loadLive();
            }}
            refreshingLiveData={refreshingLive}
            liveLastUpdated={liveFetchedAt}
            keyIncidents={keyIncidents}
            fireImpact={mode === 'live' ? routeData?.fire_impact ?? null : null}
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



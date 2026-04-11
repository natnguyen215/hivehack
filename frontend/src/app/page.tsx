'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import Sidebar from '@/components/Sidebar';
import StatusBanner from '@/components/StatusBanner';
import { fetchRoutes, fetchStatus, fetchUpdates } from '@/lib/api';
import { FIRE_SNAPSHOTS } from '@/lib/fire-timeline';
import type { FireSnapshot, LiveUpdate, RouteResponse, WildfireStatus } from '@/types';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
const TimelineSlider = dynamic(() => import('@/components/TimelineSlider'), { ssr: false });

const DEFAULT_OVERLAYS = ['evac_zones', 'fire_perimeters', 'smoke_regions', 'road_closures'];

// Fixed origin: Downtown LA [lng, lat]. The text input is a display label only —
// geocoding is out of scope for the demo.
const ORIGIN_COORDS: [number, number] = [-118.2437, 34.0522];
const DESTINATION_COORDS: [number, number] = [-119.6982, 34.4208]; // Santa Barbara

export default function HomePage() {
  const [origin, setOrigin] = useState('Los Angeles, CA');
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(DEFAULT_OVERLAYS));
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [statusData, setStatusData] = useState<WildfireStatus | null>(null);
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const activeSnapshot: FireSnapshot = FIRE_SNAPSHOTS[timelineIndex];

  useEffect(() => {
    fetchStatus()
      .then(setStatusData)
      .catch((error) => console.error('Failed to load status', error));

    fetchUpdates()
      .then(setUpdates)
      .catch((error) => console.error('Failed to load updates', error));
  }, []);

  const handleToggle = useCallback(
    (overlayId: string) => {
      setActiveOverlays((prev) => {
        const next = new Set(prev);
        if (next.has(overlayId)) {
          next.delete(overlayId);
        } else {
          next.add(overlayId);
        }
        return next;
      });
    },
    []
  );

  const handleRouteRequest = useCallback(async () => {
    setLoadingRoute(true);
    try {
      const response = await fetchRoutes({
        origin: ORIGIN_COORDS,
        destination: DESTINATION_COORDS,
        overlays: Array.from(activeOverlays),
        timestamp: activeSnapshot.label,
      });
      setRouteData(response);
    } catch (error) {
      console.error('Failed to fetch route', error);
    } finally {
      setLoadingRoute(false);
    }
  }, [activeOverlays, activeSnapshot.label]);

  useEffect(() => {
    handleRouteRequest();
  }, [handleRouteRequest]);

  const routeGeometry = activeSnapshot.routeGeometry;

  const timelineRouteData = useMemo(() => ({
    recommended: {
      id: 'timeline-route',
      name: activeSnapshot.routeName,
      distance_miles: activeSnapshot.routeBlocked ? 102.3 : 92.4,
      duration_minutes: activeSnapshot.routeBlocked ? 124.0 : 108.0,
      risk: activeSnapshot.routeRisk,
      segments: [],
      geometry: activeSnapshot.routeGeometry,
    },
    alternatives: [],
  }), [activeSnapshot]);

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1120]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <div>
            <h1 className="text-lg font-bold leading-none tracking-tight text-white">EmberPath</h1>
            <p className="text-xs text-slate-400">Wildfire Evacuation Router</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
          <span className="text-xs font-semibold text-red-300">Live Monitoring</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col gap-4 p-5">
        <StatusBanner status={statusData} updates={updates} />
        <div className="grid flex-1 grid-cols-[380px_1fr] gap-4">
          <Sidebar
            origin={origin}
            onOriginChange={setOrigin}
            activeOverlays={activeOverlays}
            onToggle={handleToggle}
            routeData={timelineRouteData}
            loading={loadingRoute}
            onSubmit={handleRouteRequest}
          />
          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900 p-2">
            <MapView
              activeOverlays={activeOverlays}
              routeGeometry={routeGeometry}
              fireOverride={activeSnapshot.geojson}
            />
            <TimelineSlider
              snapshots={FIRE_SNAPSHOTS}
              activeIndex={timelineIndex}
              onChange={setTimelineIndex}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import Sidebar from '@/components/Sidebar';
import StatusBanner from '@/components/StatusBanner';
import { fetchRoutes, fetchStatus, fetchUpdates } from '@/lib/api';
import type { LiveUpdate, RouteResponse, WildfireStatus } from '@/types';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const DEFAULT_OVERLAYS = ['evac_zones', 'fire_perimeters', 'smoke_regions', 'road_closures'];

export default function HomePage() {
  const [origin, setOrigin] = useState('Los Angeles, CA');
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(DEFAULT_OVERLAYS));
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [statusData, setStatusData] = useState<WildfireStatus | null>(null);
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

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
    if (!origin.trim()) return;
    setLoadingRoute(true);
    try {
      const response = await fetchRoutes({ origin, overlays: Array.from(activeOverlays) });
      setRouteData(response);
    } catch (error) {
      console.error('Failed to fetch route', error);
    } finally {
      setLoadingRoute(false);
    }
  }, [activeOverlays, origin]);

  useEffect(() => {
    handleRouteRequest();
  }, [handleRouteRequest]);

  const routeGeometry = useMemo(() => routeData?.recommended.geometry ?? null, [routeData]);

  return (
    <main className="space-y-4 p-6">
      <StatusBanner status={statusData} updates={updates} />
      <div className="grid grid-cols-[380px_1fr] gap-4">
        <Sidebar
          origin={origin}
          onOriginChange={setOrigin}
          activeOverlays={activeOverlays}
          onToggle={handleToggle}
          routeData={routeData}
          loading={loadingRoute}
          onSubmit={handleRouteRequest}
        />
        <div className="rounded-xl border border-white/10 bg-slate-900 p-2">
          <MapView activeOverlays={activeOverlays} routeGeometry={routeGeometry} />
        </div>
      </div>
    </main>
  );
}
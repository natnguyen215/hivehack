'use client';

import { FormEvent } from 'react';

import { cn } from '@/lib/utils';
import type { Route, RouteResponse } from '@/types';

type SidebarProps = {
  origin: string;
  onOriginChange: (value: string) => void;
  activeOverlays: Set<string>;
  onToggle: (id: string) => void;
  routeData: RouteResponse | null;
  loading: boolean;
  onSubmit: () => void;
};

const overlayOptions = [
  { id: 'fire_perimeters', label: 'Fire' },
  { id: 'smoke_regions', label: 'Smoke' },
  { id: 'evac_zones', label: 'Evac Zones' },
  { id: 'road_closures', label: 'Road Closures' },
];

function RouteCard({ route, title }: { route: Route; title: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-slate-800/60 p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>{title}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
            route.risk === 'low'
              ? 'bg-emerald-500/20 text-emerald-200'
              : route.risk === 'moderate'
              ? 'bg-amber-500/20 text-amber-200'
              : 'bg-red-500/20 text-red-200'
          )}
        >
          {route.risk}
        </span>
      </div>
      <h4 className="text-lg font-semibold text-white">{route.name}</h4>
      <p className="text-sm text-slate-300">
        {route.distance_miles.toFixed(1)} mi  -  {Math.round(route.duration_minutes)} min ETA
      </p>
      <div className="space-y-1 text-sm text-slate-400">
        {route.segments.map((segment) => (
          <div key={segment.name} className="flex items-center justify-between">
            <span>{segment.name}</span>
            <span>
              {segment.distance_miles.toFixed(1)} mi  -  {Math.round(segment.duration_minutes)} min
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({
  origin,
  onOriginChange,
  activeOverlays,
  onToggle,
  routeData,
  loading,
  onSubmit,
}: SidebarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <aside className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="text-sm font-semibold text-slate-300">Origin Address</label>
        <div className="flex gap-2">
          <input
            value={origin}
            onChange={(event) => onOriginChange(event.target.value)}
            placeholder="123 Main St, Los Angeles"
            className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/40"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-ember px-4 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60"
          >
            {loading ? 'Loading' : 'Find Route'}
          </button>
        </div>
      </form>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Overlays</h3>
        <div className="space-y-2">
          {overlayOptions.map((overlay) => {
            const selected = activeOverlays.has(overlay.id);
            return (
              <button
                key={overlay.id}
                type="button"
                onClick={() => onToggle(overlay.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition',
                  selected
                    ? 'border-ember bg-ember/10 text-white'
                    : 'border-white/10 bg-transparent text-slate-400 hover:border-ember/60'
                )}
              >
                <span>{overlay.label}</span>
                <span className="text-xs uppercase">{selected ? 'On' : 'Off'}</span>
              </button>
            );
          })}
        </div>
      </section>

      {routeData && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recommended Route
          </h3>
          <RouteCard route={routeData.recommended} title="Primary" />

          {routeData.alternatives.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-400">Alternatives</h4>
              {routeData.alternatives.map((route) => (
                <RouteCard key={route.id} route={route} title="Alternate" />
              ))}
            </div>
          )}

          <p className="text-sm text-slate-400">
            Routes are calculated against the latest fire perimeters, smoke plumes, and
            transportation alerts. Manually toggle overlays to explore additional context.
          </p>
        </section>
      )}
    </aside>
  );
}


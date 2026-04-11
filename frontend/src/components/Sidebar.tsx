'use client';

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { searchPlaces } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DataMode, FireImpact, GeocodingSuggestion, KeyIncident, MapTheme, Route, RouteResponse } from '@/types';

type HistoricalNarrative = {
  title?: string;
  summary?: string;
  timestampLabel?: string;
  routeNarrative?: string;
};

type SidebarProps = {
  origin: string;
  destination: string;
  onOriginChange: (value: string, coords?: [number, number]) => void;
  onDestinationChange: (value: string, coords?: [number, number]) => void;
  activeOverlays: Set<string>;
  onToggle: (id: string) => void;
  routeData: RouteResponse | null;
  loading: boolean;
  onSubmit: () => void;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  mode?: DataMode;
  onModeChange?: (mode: DataMode) => void;
  mapTheme?: MapTheme;
  onMapThemeChange?: (theme: MapTheme) => void;
  onRefreshLiveData?: () => void;
  refreshingLiveData?: boolean;
  liveLastUpdated?: string | null;
  keyIncidents?: KeyIncident[];
  fireImpact?: FireImpact | null;
  historicalNarrative?: HistoricalNarrative | null;
};

type OverlayOption = {
  id: string;
  label: string;
  swatchClass: string;
};

const overlayOptions: OverlayOption[] = [
  { id: 'fire_perimeters', label: 'Fire Perimeters', swatchClass: 'bg-red-400' },
];

const mapThemeOptions: Array<{ id: MapTheme; label: string; swatchClass: string }> = [
  { id: 'dark', label: 'Dark', swatchClass: 'bg-slate-900' },
  { id: 'gray', label: 'Pure Grey', swatchClass: 'bg-neutral-500' },
  { id: 'white', label: 'Pure White', swatchClass: 'bg-white' },
  { id: 'color', label: 'Teal Tint', swatchClass: 'bg-cyan-400' },
];

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/35' },
  moderate: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/35' },
  high: { bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/35' },
};

function formatLastUpdated(value: string | null | undefined): string {
  if (!value) return 'Not yet refreshed';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const now = new Date();
  const isSameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  return isSameDay
    ? parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : parsed.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function RouteCard({
  route,
  title,
  selected,
  onSelect,
}: {
  route: Route;
  title: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const risk = riskColors[route.risk] ?? riskColors.moderate;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-all',
        selected
          ? 'border-orange-400/45 bg-orange-500/10 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]'
          : 'border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.06]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            risk.bg,
            risk.text,
            risk.border,
          )}
        >
          {route.risk}
        </span>
      </div>
      <h4 className="mt-1 text-sm font-semibold text-white">{route.name}</h4>
      <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {Math.round(route.duration_minutes)} min
        </span>
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {route.distance_miles.toFixed(1)} mi
        </span>
      </div>
    </button>
  );
}

function PlaceAutocomplete({
  value,
  onChange,
  placeholder,
  label,
  icon,
}: {
  value: string;
  onChange: (value: string, coords?: [number, number]) => void;
  placeholder: string;
  label: string;
  icon: ReactNode;
}) {
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const results = await searchPlaces(trimmed, controller.signal);
          if (requestIdRef.current !== requestId) return;
          setSuggestions(results);
          setOpen(results.length > 0);
        } catch {
          if (requestIdRef.current !== requestId) return;
          setSuggestions([]);
          setOpen(false);
        }
      })();
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="sr-only">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 transition focus-within:border-orange-400/50 focus-within:bg-black/35">
        <span className="flex-shrink-0 text-slate-500">{icon}</span>
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            fetchSuggestions(event.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-white/10 bg-slate-950 py-1 shadow-2xl shadow-black/50">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.place_name}-${suggestion.center.join(',')}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(suggestion.place_name, suggestion.center);
                  setOpen(false);
                  setSuggestions([]);
                }}
                className="w-full px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-orange-500/15 hover:text-white"
              >
                {suggestion.place_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sidebar({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  activeOverlays,
  onToggle,
  routeData,
  loading,
  onSubmit,
  selectedRouteId,
  onSelectRoute,
  mode,
  onModeChange,
  mapTheme = 'dark',
  onMapThemeChange,
  onRefreshLiveData,
  refreshingLiveData = false,
  liveLastUpdated,
  keyIncidents = [],
  fireImpact,
  historicalNarrative,
}: SidebarProps) {
  const resolvedMode = mode ?? 'live';
  const resolvedMapTheme = mapTheme;
  const handleModeChange = onModeChange;
  const handleMapThemeChange = onMapThemeChange;

  const allRoutes = useMemo(() => {
    if (!routeData) return [] as Array<{ route: Route; title: string }>;

    return [
      { route: routeData.recommended, title: 'Recommended' },
      ...routeData.alternatives.map((route, index) => ({
        route,
        title: `Alternative ${index + 1}`,
      })),
    ];
  }, [routeData]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <aside className="custom-scrollbar flex h-full flex-col overflow-y-auto rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(8,12,22,0.96),rgba(8,12,22,0.9))] shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-sm">
      <div className="border-b border-white/10 p-4">
        <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              aria-pressed={resolvedMode === 'live'}
              onClick={() => handleModeChange?.('live')}
              className={cn(
                'rounded-lg px-2 py-1.5 text-xs font-semibold transition',
                resolvedMode === 'live'
                  ? 'bg-orange-500/20 text-orange-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              Live Data
            </button>
            <button
              type="button"
              aria-pressed={resolvedMode === 'historical'}
              onClick={() => handleModeChange?.('historical')}
              className={cn(
                'rounded-lg px-2 py-1.5 text-xs font-semibold transition',
                resolvedMode === 'historical'
                  ? 'bg-orange-500/20 text-orange-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              Historical Showcase
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Map color</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {mapThemeOptions.map((option) => {
              const active = resolvedMapTheme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleMapThemeChange?.(option.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition',
                    active
                      ? 'border-orange-400/45 bg-orange-500/10 text-white'
                      : 'border-white/10 bg-transparent text-slate-400 hover:border-white/20 hover:text-slate-200',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full border border-white/40', option.swatchClass)} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {resolvedMode === 'live' ? (
          <>
            <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Live Perimeters</p>
                  <p className="mt-1 text-xs text-slate-400">Last updated {formatLastUpdated(liveLastUpdated)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRefreshLiveData?.()}
                  disabled={!onRefreshLiveData || refreshingLiveData}
                  className="rounded-lg border border-orange-400/40 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-200 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshingLiveData ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {keyIncidents.length > 0 && (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Key incidents</p>
                  <ul className="space-y-1.5">
                    {keyIncidents.slice(0, 3).map((incident, index) => (
                      <li
                        key={incident.id ?? `${incident.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1 text-xs text-slate-200"
                      >
                        <span className="truncate">{incident.name}</span>
                        <span className="flex-shrink-0 text-[10px] text-slate-400">
                          {typeof incident.acres === 'number'
                            ? `${Math.round(incident.acres).toLocaleString()} ac`
                            : incident.display_status ?? 'Active'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              <PlaceAutocomplete
                value={origin}
                onChange={onOriginChange}
                placeholder="Where are you?"
                label="Origin"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="8" strokeDasharray="4 4" />
                  </svg>
                }
              />

              <div className="flex justify-center">
                <div className="h-3 w-px bg-white/15" />
              </div>

              <PlaceAutocomplete
                value={destination}
                onChange={onDestinationChange}
                placeholder="Where to? (e.g. San Francisco)"
                label="Destination"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                }
              />

              <button
                type="submit"
                disabled={loading || !destination.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path
                        d="M4 12a8 8 0 018-8"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="opacity-75"
                      />
                    </svg>
                    Finding safe routes...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0020 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Find Safe Routes
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Pitch narrative</p>
            <h3 className="mt-1 text-sm font-semibold text-white">
              {historicalNarrative?.title ?? 'Palisades fire progression'}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {historicalNarrative?.summary ??
                'Use the timeline slider to show perimeter growth and why reroutes switch from coastal to inland corridors.'}
            </p>
            {(historicalNarrative?.timestampLabel || historicalNarrative?.routeNarrative) && (
              <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-slate-300">
                {historicalNarrative.timestampLabel && <p>{historicalNarrative.timestampLabel}</p>}
                {historicalNarrative.routeNarrative && <p className="mt-0.5 text-slate-400">{historicalNarrative.routeNarrative}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {resolvedMode === 'live' && (
        <div className="border-b border-white/10 p-4">
          {fireImpact && (fireImpact.blocked || fireImpact.impacted_incidents.length > 0) && (
            <div className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
              <p className="text-xs font-semibold text-red-200">Live route impact detected</p>
              <p className="mt-1 text-xs text-red-100/90">
                {fireImpact.blocked ? 'Primary route intersects an active perimeter.' : 'Route has nearby fire impact.'}
              </p>
              {fireImpact.impacted_incidents.length > 0 && (
                <p className="mt-1 text-[11px] text-red-200">Impacted: {fireImpact.impacted_incidents.slice(0, 3).join(', ')}</p>
              )}
            </div>
          )}

          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Live Data Layers</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {overlayOptions.map((overlay) => {
              const active = activeOverlays.has(overlay.id);
              return (
                <button
                  key={overlay.id}
                  type="button"
                  onClick={() => onToggle(overlay.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition',
                    active
                      ? 'border-orange-400/45 bg-orange-500/10 text-white'
                      : 'border-white/10 bg-transparent text-slate-500 hover:border-white/20 hover:text-slate-300',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', active ? overlay.swatchClass : 'bg-slate-600')} />
                  {overlay.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {resolvedMode === 'live' && allRoutes.length > 0 && (
        <div className="flex-1 p-4">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Routes ({allRoutes.length})
          </h3>
          <div className="space-y-2">
            {allRoutes.map(({ route, title }) => (
              <RouteCard
                key={route.id}
                route={route}
                title={title}
                selected={selectedRouteId === route.id}
                onSelect={() => onSelectRoute(route.id)}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Routes avoid active fire perimeters. Select a route to preview on the map.
          </p>
        </div>
      )}

      {resolvedMode === 'live' && allRoutes.length === 0 && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-slate-500"
            >
              <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0020 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-400">Enter a destination</p>
          <p className="mt-1 text-xs text-slate-500">Find a route that avoids active wildfire hazards.</p>
        </div>
      )}

      {resolvedMode === 'historical' && (
        <div className="flex-1 p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
            <p className="font-semibold text-white">Historical mode active</p>
            <p className="mt-1 leading-relaxed text-slate-400">
              Live overlays and route requests are paused. Use the timeline below the map to walk through the historical
              perimeter snapshots.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

export default memo(Sidebar);

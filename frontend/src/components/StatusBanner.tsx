'use client';

import { memo, useEffect, useRef, useMemo, useState } from 'react';
import type { LiveUpdate, WildfireStatus } from '@/types';

type LiveStatusLike = Partial<WildfireStatus> & {
  active_incidents?: number;
  total_incidents?: number;
  updated?: string;
  updatedAt?: string;
};

type LiveKeyIncident = {
  id?: string;
  name: string;
  acres?: number;
  severity?: string;
};

type LivePayload = {
  fetched_at?: string;
  status?: LiveStatusLike | null;
  updates?: LiveUpdate[];
  key_incidents?: LiveKeyIncident[];
  advisory?: string;
};

type StatusBannerProps = {
  status?: WildfireStatus | null;
  updates?: LiveUpdate[];
  livePayload?: LivePayload | null;
};

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  moderate: 'bg-amber-400',
  low: 'bg-emerald-400',
  info: 'bg-slate-400',
};

const severityBg: Record<string, string> = {
  critical: 'border-red-500/30 bg-red-500/10',
  high: 'border-orange-500/30 bg-orange-500/10',
  moderate: 'border-amber-500/30 bg-amber-500/10',
  low: 'border-emerald-500/30 bg-emerald-500/10',
  info: 'border-slate-500/30 bg-slate-500/10',
};

function asFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatBannerTimestamp(value: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusBanner({ status = null, updates = [], livePayload = null }: StatusBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  const effectiveStatus = livePayload?.status ?? status;
  const effectiveUpdates = livePayload?.updates ?? updates;
  const keyIncidents = livePayload?.key_incidents ?? [];

  const activeCount = useMemo(() => {
    const fromStatus =
      asFiniteNumber(effectiveStatus?.active_fires) ??
      asFiniteNumber(effectiveStatus?.active_incidents) ??
      asFiniteNumber(effectiveStatus?.total_incidents);

    if (fromStatus !== null) return fromStatus;
    if (keyIncidents.length > 0) return keyIncidents.length;
    return null;
  }, [effectiveStatus?.active_fires, effectiveStatus?.active_incidents, effectiveStatus?.total_incidents, keyIncidents.length]);

  const severity = (effectiveStatus?.level ?? (activeCount && activeCount > 0 ? 'high' : 'info')).toLowerCase();
  const dot = severityDot[severity] ?? severityDot.info;
  const bg = severityBg[severity] ?? severityBg.info;

  const advisory = effectiveStatus?.advisory ?? livePayload?.advisory ?? 'Monitoring active wildfire conditions across the region.';
  const counties = Array.isArray(effectiveStatus?.counties) ? effectiveStatus.counties : [];
  const updatedLabel = formatBannerTimestamp(
    livePayload?.fetched_at ?? effectiveStatus?.updated_at ?? effectiveStatus?.updated ?? effectiveStatus?.updatedAt ?? null,
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition hover:brightness-110 ${bg}`}
      >
        <span className={`h-2 w-2 rounded-full animate-pulse-dot ${dot}`} />
        <span className="font-medium text-white">
          {activeCount !== null
            ? `${activeCount} Active Fire${activeCount !== 1 ? 's' : ''}`
            : effectiveStatus
              ? 'Monitoring Wildfire Risk'
              : 'Loading...'}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
          {(effectiveStatus || advisory) && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Advisory</p>
              <p className="mt-1 text-sm font-medium leading-snug text-white">{advisory}</p>
              {counties.length > 0 && <p className="mt-1 text-xs text-slate-400">Counties: {counties.join(', ')}</p>}
              {updatedLabel && <p className="mt-1 text-[11px] text-slate-500">Last sync: {updatedLabel}</p>}
            </div>
          )}

          {keyIncidents.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Key Incidents</p>
              <ul className="space-y-1.5">
                {keyIncidents.slice(0, 3).map((incident, index) => (
                  <li key={incident.id ?? `${incident.name}-${index}`} className="text-xs text-slate-300">
                    <span className="font-medium text-slate-200">{incident.name}</span>
                    {typeof incident.acres === 'number' && (
                      <span className="ml-1 text-slate-500">({Math.round(incident.acres).toLocaleString()} ac)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {effectiveUpdates.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Latest Updates</p>
              <ul className="space-y-2">
                {effectiveUpdates.slice(0, 3).map((update) => (
                  <li key={update.id} className="text-xs text-slate-300">
                    <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${severityDot[update.severity] ?? severityDot.info}`} />
                    <span className="font-semibold uppercase text-slate-400">{update.category}</span>{' '}
                    {update.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(StatusBanner);

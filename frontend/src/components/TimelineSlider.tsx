'use client';

import type { FireSnapshot } from '@/types';
import { cn } from '@/lib/utils';

type TimelineSliderProps = {
  snapshots: FireSnapshot[];
  activeIndex: number;
  onChange: (index: number) => void;
};

const acreLabels = ['~200 ac', '~5,000 ac', '~12,000 ac', '~18,000 ac', '~23,000 ac'];

export default function TimelineSlider({ snapshots, activeIndex, onChange }: TimelineSliderProps) {
  const active = snapshots[activeIndex];
  const pct = snapshots.length > 1 ? (activeIndex / (snapshots.length - 1)) * 100 : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/90 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Fire Replay
          </span>
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">
            Palisades Fire · Jan 7, 2025
          </span>
        </div>

        {active && (
          <div className="flex items-center gap-2">
            {active.routeBlocked ? (
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">
                US-101 Blocked
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                Route Clear
              </span>
            )}
            <span className="text-xs font-medium text-white">{active.label}</span>
            <span className="text-xs text-slate-400">{acreLabels[activeIndex]}</span>
          </div>
        )}
      </div>

      {/* Track */}
      <div className="relative mb-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          step={1}
          value={activeIndex}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Fire timeline"
        />

        {/* Step dots */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-0">
          {snapshots.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={cn(
                'pointer-events-auto h-3 w-3 rounded-full border-2 transition-all duration-150',
                i <= activeIndex
                  ? 'border-red-500 bg-red-400'
                  : 'border-slate-600 bg-slate-800'
              )}
            />
          ))}
        </div>
      </div>

      {/* Timestamp labels */}
      <div className="flex justify-between">
        {snapshots.map((snap, i) => (
          <button
            key={snap.index}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              'text-xs transition-colors',
              i === activeIndex ? 'font-semibold text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {snap.label.split(' · ')[1]}
          </button>
        ))}
      </div>

      {/* Reroute notice */}
      {active?.routeBlocked && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
          <p className="text-xs leading-tight text-red-200">
            <span className="font-semibold">Standard route blocked.</span> Rerouting away from
            hazard zone via{' '}
            <span className="font-medium text-white">{active.routeName}</span>.
          </p>
        </div>
      )}
    </div>
  );
}

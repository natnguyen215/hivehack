'use client';

import { memo } from 'react';

import { cn } from '@/lib/utils';
import type { FireSnapshot } from '@/types';

type TimelineSliderProps = {
  snapshots: FireSnapshot[];
  activeIndex: number;
  onChange: (index: number) => void;
};

const acreLabels = ['~200 ac', '~5,000 ac', '~12,000 ac', '~18,000 ac', '~23,000 ac'];

function getShortLabel(label: string | undefined, fallbackIndex: number): string {
  if (!label) return `Step ${fallbackIndex + 1}`;
  const parts = label.split(' - ');
  return parts[1] ?? parts[0];
}

function TimelineSlider({ snapshots, activeIndex, onChange }: TimelineSliderProps) {
  const active = snapshots[activeIndex];
  const progressPercent = snapshots.length > 1 ? (activeIndex / (snapshots.length - 1)) * 100 : 0;
  const timeLabel = getShortLabel(active?.label, activeIndex);

  return (
    <div data-testid="timeline-slider" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Fire Timeline</span>
          <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            Palisades Fire
          </span>
        </div>

        {active && (
          <div className="flex items-center gap-2">
            {active.routeBlocked ? (
              <span
                data-testid="timeline-route-status"
                className="flex items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse-dot" />
                Route Blocked
              </span>
            ) : (
              <span
                data-testid="timeline-route-status"
                className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Route Clear
              </span>
            )}
            <span data-testid="timeline-active-label" className="text-xs font-medium text-white">
              {active.label}
            </span>
            <span data-testid="timeline-acre-label" className="text-[10px] text-slate-500">
              {typeof active.acres === 'number'
                ? `~${Math.round(active.acres).toLocaleString()} ac`
                : (acreLabels[activeIndex] ?? acreLabels[acreLabels.length - 1])}
            </span>
          </div>
        )}
      </div>

      <div className="relative mb-2">
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, snapshots.length - 1)}
          step={1}
          value={activeIndex}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          data-testid="timeline-range"
          aria-label="Fire timeline slider"
          aria-valuetext={timeLabel}
        />

        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
          {snapshots.map((snapshot, index) => (
            <button
              key={`${snapshot.index}-${index}`}
              type="button"
              onClick={() => onChange(index)}
              data-testid={`timeline-step-${index}`}
              aria-label={`Select timeline step ${index + 1}: ${getShortLabel(snapshot.label, index)}`}
              className={cn(
                'pointer-events-auto h-2.5 w-2.5 rounded-full border-2 transition-all duration-150',
                index <= activeIndex
                  ? 'border-red-500 bg-red-400 shadow-sm shadow-red-500/30'
                  : 'border-slate-700 bg-slate-800',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        {snapshots.map((snapshot, index) => (
          <button
            key={`${snapshot.index}-${index}-label`}
            type="button"
            onClick={() => onChange(index)}
            data-testid={`timeline-label-${index}`}
            aria-label={`Jump to ${snapshot.label}`}
            className={cn(
              'text-[10px] transition-colors',
              index === activeIndex ? 'font-semibold text-white' : 'text-slate-600 hover:text-slate-400',
            )}
          >
            {getShortLabel(snapshot.label, index)}
          </button>
        ))}
      </div>

      {active?.routeBlocked && (
        <div
          data-testid="timeline-reroute-notice"
          className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5"
        >
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400 animate-pulse-dot" />
          <p className="text-[11px] text-red-300">
            <span className="font-semibold">Standard route blocked.</span>{' '}
            Rerouting via <span className="font-medium text-white">{active.routeName}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(TimelineSlider);

'use client';

import type { LiveUpdate, WildfireStatus } from '@/types';

type StatusBannerProps = {
  status: WildfireStatus | null;
  updates: LiveUpdate[];
};

const severityStyles: Record<string, string> = {
  critical: 'from-red-600 to-red-500',
  high: 'from-orange-500 to-orange-400',
  moderate: 'from-amber-400 to-amber-300 text-slate-900',
  low: 'from-emerald-500 to-emerald-400 text-slate-900',
  info: 'from-slate-600 to-slate-500',
};

export default function StatusBanner({ status, updates }: StatusBannerProps) {
  const severity = status?.level ?? 'info';
  const gradient = severityStyles[severity] ?? severityStyles.info;
  const advisory =
    status?.advisory ?? 'Monitoring wildfires across Southern California. Stand by for updates.';

  return (
    <section
      className={`rounded-2xl bg-gradient-to-r ${gradient} px-6 py-4 text-white shadow-lg`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest opacity-70">Current Advisory</p>
          <p className="mt-0.5 text-lg font-bold leading-tight md:text-xl">{advisory}</p>
          {status && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm opacity-90">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                🔥 {status.active_fires} active fires
              </span>
              <span className="opacity-60">·</span>
              <span className="text-xs">{status.counties.join(', ')}</span>
              <span className="opacity-40">·</span>
              <span className="text-xs opacity-70">Updated {status.updated_at}</span>
            </div>
          )}
        </div>
        {updates.length > 0 && (
          <div className="rounded-xl bg-white/15 p-4 text-sm backdrop-blur">
            <p className="mb-2 text-xs uppercase tracking-wide opacity-80">Latest Updates</p>
            <ul className="space-y-1">
              {updates.slice(0, 2).map((update) => (
                <li key={update.id} className="text-white/90">
                  <span className="font-semibold uppercase text-white/80">{update.category}:</span>{' '}
                  {update.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}


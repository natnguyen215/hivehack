/**
 * TimelineSlider component tests.
 * Requires jsdom: `npm i -D jsdom` and set `environment: 'jsdom'` in vitest.config.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimelineSlider from '../TimelineSlider';
import { FIRE_SNAPSHOTS } from '@/lib/fire-timeline';

describe('TimelineSlider', () => {
  it('renders the fire replay label', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={() => {}} />
    );
    expect(screen.getByText(/Fire Replay/i)).toBeInTheDocument();
  });

  it('renders a timestamp label for every snapshot', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={() => {}} />
    );
    // Each snapshot has a label like "Jan 7 · 06:00" — the time portion appears as a button
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.getByText('22:00')).toBeInTheDocument();
  });

  it('shows "Route Clear" badge when route is not blocked', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={() => {}} />
    );
    expect(screen.getByText(/Route Clear/i)).toBeInTheDocument();
  });

  it('shows "US-101 Blocked" badge when route is blocked', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={2} onChange={() => {}} />
    );
    expect(screen.getByText(/US-101 Blocked/i)).toBeInTheDocument();
  });

  it('shows reroute notice paragraph when route is blocked', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={3} onChange={() => {}} />
    );
    expect(screen.getByText(/Standard route blocked/i)).toBeInTheDocument();
  });

  it('does not show reroute notice when route is clear', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={1} onChange={() => {}} />
    );
    expect(screen.queryByText(/Standard route blocked/i)).not.toBeInTheDocument();
  });

  it('calls onChange when a step dot is clicked', () => {
    const onChange = vi.fn();
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={onChange} />
    );
    // Click the 3rd dot (index 2)
    const dots = screen.getAllByRole('button');
    fireEvent.click(dots[2]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('calls onChange when a timestamp label is clicked', () => {
    const onChange = vi.fn();
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('22:00'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('displays the rerouted route name in the notice', () => {
    render(
      <TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={2} onChange={() => {}} />
    );
    expect(screen.getByText(/I-405/i)).toBeInTheDocument();
  });
});

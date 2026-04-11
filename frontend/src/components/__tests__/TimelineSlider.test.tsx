import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import TimelineSlider from '../TimelineSlider';
import { FIRE_SNAPSHOTS } from '@/lib/fire-timeline';

describe('TimelineSlider', () => {
  it('renders slider controls for every snapshot', () => {
    render(<TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={() => {}} />);

    expect(screen.getByTestId('timeline-slider')).toBeInTheDocument();
    expect(screen.getByText(/Fire Timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Palisades Fire/i)).toBeInTheDocument();
    expect(screen.getByTestId('timeline-active-label')).toHaveTextContent(FIRE_SNAPSHOTS[0].label);
    expect(screen.getByTestId('timeline-acre-label')).toHaveTextContent(/ac/i);
    expect(screen.getByTestId('timeline-range')).toHaveAttribute('max', String(FIRE_SNAPSHOTS.length - 1));
    expect(screen.getAllByTestId(/timeline-step-/)).toHaveLength(FIRE_SNAPSHOTS.length);
    expect(screen.getAllByTestId(/timeline-label-/)).toHaveLength(FIRE_SNAPSHOTS.length);

    for (const snapshot of FIRE_SNAPSHOTS) {
      expect(screen.getByRole('button', { name: `Jump to ${snapshot.label}` })).toBeInTheDocument();
    }
  });

  it('shows clear status when route is open', () => {
    render(<TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={() => {}} />);

    expect(screen.getByTestId('timeline-route-status')).toHaveTextContent(/Route Clear/i);
    expect(screen.queryByTestId('timeline-reroute-notice')).not.toBeInTheDocument();
  });

  it('shows blocked status and reroute notice when impacted', () => {
    render(<TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={3} onChange={() => {}} />);

    expect(screen.getByTestId('timeline-route-status')).toHaveTextContent(/Route Blocked/i);
    expect(screen.getByTestId('timeline-reroute-notice')).toHaveTextContent(/Standard route blocked/i);
    expect(screen.getByTestId('timeline-reroute-notice')).toHaveTextContent(FIRE_SNAPSHOTS[3].routeName);
  });

  it('calls onChange when the slider range changes', () => {
    const onChange = vi.fn();
    render(<TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('timeline-range'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('calls onChange when a step dot is clicked', () => {
    const onChange = vi.fn();
    render(<TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('timeline-step-2'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('calls onChange when a time label is clicked', () => {
    const onChange = vi.fn();
    render(<TimelineSlider snapshots={FIRE_SNAPSHOTS} activeIndex={0} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('timeline-label-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

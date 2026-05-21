import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';

import Sidebar from '../Sidebar';

const mockRouteData = {
  recommended: {
    id: 'route-1',
    name: 'US-101 Coastal',
    distance_miles: 92.4,
    duration_minutes: 108,
    risk: 'low',
    segments: [],
    geometry: {
      type: 'LineString' as const,
      coordinates: [
        [-118.2437, 34.0522],
        [-119.6982, 34.4208],
      ] as [number, number][],
    },
  },
  alternatives: [
    {
      id: 'route-2',
      name: 'I-5 Inland',
      distance_miles: 109.2,
      duration_minutes: 132,
      risk: 'moderate',
      segments: [],
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-118.2437, 34.0522],
          [-119.6982, 34.4208],
        ] as [number, number][],
      },
    },
  ],
  fire_impact: null,
};

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props: React.ComponentProps<typeof Sidebar> = {
    origin: 'Los Angeles, CA',
    destination: 'Santa Barbara, CA',
    onOriginChange: vi.fn(),
    onDestinationChange: vi.fn(),
    activeOverlays: new Set(['fire_perimeters']),
    onToggle: vi.fn(),
    routeData: mockRouteData,
    loading: false,
    onSubmit: vi.fn(),
    selectedRouteId: 'route-1',
    onSelectRoute: vi.fn(),
    ...overrides,
  };

  return render(<Sidebar {...props} />);
}

describe('Sidebar', () => {
  it('renders mode tabs and live controls by default', () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: /Live Data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sample Fallback/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Historical Showcase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find Safe Routes/i })).toBeInTheDocument();
    expect(screen.getByText(/Live Data Layers/i)).toBeInTheDocument();
    expect(screen.getByText(/Routes \(2\)/i)).toBeInTheDocument();
  });

  it('fires mode change callback when switching tabs', () => {
    const onModeChange = vi.fn();
    renderSidebar({ onModeChange });

    fireEvent.click(screen.getByRole('button', { name: /Sample Fallback/i }));
    expect(onModeChange).toHaveBeenCalledWith('fallback');
  });

  it('does not render map color controls', () => {
    renderSidebar();

    expect(screen.queryByText(/Map color/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pure Grey/i })).not.toBeInTheDocument();
  });

  it('shows live refresh, incidents, and route impact warning', () => {
    const onRefreshLiveData = vi.fn();

    renderSidebar({
      liveLastUpdated: '2026-04-11T14:30:00.000Z',
      keyIncidents: [
        { id: 'i1', name: 'Palisades Fire', acres: 23450, severity: 'critical' },
        { id: 'i2', name: 'Sunset Fire', acres: 4120, severity: 'moderate' },
      ],
      fireImpact: {
        blocked: true,
        impacted_incidents: ['Palisades Fire'],
      },
      onRefreshLiveData,
    });

    expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
    expect(screen.getByText(/Active fires/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Palisades Fire/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Live route impact detected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(onRefreshLiveData).toHaveBeenCalledTimes(1);
  });

  it('shows historical narrative and hides live-only sections in historical mode', () => {
    renderSidebar({
      mode: 'historical',
      historicalNarrative: {
        title: 'Palisades growth replay',
        summary: 'Demonstrate perimeter expansion and reroute transition.',
      },
    });

    expect(screen.getByText(/Palisades growth replay/i)).toBeInTheDocument();
    expect(screen.getByText(/Historical mode active/i)).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Find Safe Routes/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Live Data Layers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Routes \(2\)/i)).not.toBeInTheDocument();
  });

  it('shows fallback narrative and fixed sample route copy in fallback mode', () => {
    renderSidebar({
      mode: 'fallback',
      fallbackNarrative: {
        title: 'Topanga Canyon fallback sample',
        summary: 'Static fallback overlays and routes.',
        routeNarrative: 'Alternative 1 swings northeast around the canyon.',
      },
      fireImpact: {
        blocked: false,
        impacted_incidents: [],
      },
    });

    expect(screen.getByText(/Topanga Canyon fallback sample/i)).toBeInTheDocument();
    expect(screen.getByText(/Fallback route note/i)).toBeInTheDocument();
    expect(screen.getByText(/Alternative 1 swings northeast around the canyon/i)).toBeInTheDocument();
    expect(screen.getByText(/Sample Layers/i)).toBeInTheDocument();
    expect(screen.getByText(/Routes \(2\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Find Safe Routes/i })).not.toBeInTheDocument();
  });
});

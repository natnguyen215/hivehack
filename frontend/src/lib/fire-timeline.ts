import type { FireSnapshot } from '@/types';

// Five snapshots of the 2025 Palisades fire expanding over about 24 hours.
// Polygons are simplified bounding shapes centered on Pacific Palisades
// (~-118.52, 34.04) and growing northwest toward Malibu and east toward
// the US-101 corridor.
//
// Pre-computed safe routes:
//   T0-T1: Fire is small; US-101 Coastal is clear (low risk).
//   T2-T4: Fire engulfs the coastal corridor; route reroutes inland via
//          I-405 N -> CA-118 W -> US-101 N, clear of the perimeter.

export const FIRE_SNAPSHOTS: FireSnapshot[] = [
  {
    index: 0,
    label: 'Jan 7 - 06:00',
    routeBlocked: false,
    routeName: 'US-101 Coastal',
    routeRisk: 'low',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3950, 34.0180],
        [-118.4725, 34.0280],
        [-118.5180, 34.0390],
        [-118.6010, 34.0460],
        [-118.8070, 34.1530],
        [-119.0400, 34.2160],
        [-119.2290, 34.2750],
        [-119.6982, 34.4208],
      ],
    },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Palisades Fire', timestamp: 'Jan 7 06:00', acres: 200 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-118.555, 34.055],
                [-118.51, 34.055],
                [-118.51, 34.025],
                [-118.555, 34.025],
                [-118.555, 34.055],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 1,
    label: 'Jan 7 - 10:00',
    routeBlocked: false,
    routeName: 'US-101 Coastal',
    routeRisk: 'low',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3950, 34.0180],
        [-118.4725, 34.0280],
        [-118.5180, 34.0390],
        [-118.6010, 34.0460],
        [-118.8070, 34.1530],
        [-119.0400, 34.2160],
        [-119.2290, 34.2750],
        [-119.6982, 34.4208],
      ],
    },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Palisades Fire', timestamp: 'Jan 7 10:00', acres: 5000 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-118.61, 34.08],
                [-118.48, 34.08],
                [-118.48, 34.005],
                [-118.61, 34.005],
                [-118.61, 34.08],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 2,
    label: 'Jan 7 - 14:00',
    routeBlocked: true,
    routeName: 'I-405 N to US-101 W (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3780, 34.0290],
        [-118.4725, 34.0280],
        [-118.4690, 34.0890],
        [-118.4700, 34.1560],
        [-118.6060, 34.1710],
        [-118.7940, 34.2070],
        [-119.0400, 34.2160],
        [-119.2290, 34.2750],
        [-119.6982, 34.4208],
      ],
    },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Palisades Fire', timestamp: 'Jan 7 14:00', acres: 12000 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-118.69, 34.1],
                [-118.465, 34.1],
                [-118.465, 33.99],
                [-118.69, 33.99],
                [-118.69, 34.1],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 3,
    label: 'Jan 7 - 18:00',
    routeBlocked: true,
    routeName: 'I-405 N to US-101 W (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3780, 34.0290],
        [-118.4725, 34.0280],
        [-118.4690, 34.0890],
        [-118.4700, 34.1560],
        [-118.6060, 34.1710],
        [-118.7940, 34.2070],
        [-119.0400, 34.2160],
        [-119.2290, 34.2750],
        [-119.6982, 34.4208],
      ],
    },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Palisades Fire', timestamp: 'Jan 7 18:00', acres: 18000 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-118.79, 34.125],
                [-118.435, 34.125],
                [-118.435, 33.975],
                [-118.79, 33.975],
                [-118.79, 34.125],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 4,
    label: 'Jan 7 - 22:00',
    routeBlocked: true,
    routeName: 'I-405 N to US-101 W (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3780, 34.0290],
        [-118.4725, 34.0280],
        [-118.4690, 34.0890],
        [-118.4700, 34.1560],
        [-118.6060, 34.1710],
        [-118.7940, 34.2070],
        [-119.0400, 34.2160],
        [-119.2290, 34.2750],
        [-119.6982, 34.4208],
      ],
    },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Palisades Fire', timestamp: 'Jan 7 22:00', acres: 23000 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-118.91, 34.145],
                [-118.415, 34.145],
                [-118.415, 33.955],
                [-118.91, 33.955],
                [-118.91, 34.145],
              ],
            ],
          },
        },
      ],
    },
  },
];

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
        [-118.48, 34.06],
        [-119.2965, 34.2819],
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
        [-118.48, 34.06],
        [-119.2965, 34.2819],
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
    routeName: 'I-405 N - CA-118 W - US-101 N (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.39, 34.07],
        [-118.46, 34.16],
        [-118.55, 34.27],
        [-118.72, 34.28],
        [-119.2965, 34.2819],
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
    routeName: 'I-405 N - CA-118 W - US-101 N (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.39, 34.07],
        [-118.46, 34.16],
        [-118.55, 34.27],
        [-118.72, 34.28],
        [-119.2965, 34.2819],
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
    routeName: 'I-405 N - CA-118 W - US-101 N (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.39, 34.07],
        [-118.46, 34.16],
        [-118.55, 34.27],
        [-118.72, 34.28],
        [-119.2965, 34.2819],
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
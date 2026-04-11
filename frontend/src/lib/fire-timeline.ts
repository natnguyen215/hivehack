import type { FireSnapshot } from '@/types';

// Five snapshots of the 2025 Palisades fire expanding over ~24 hours.
// Polygons are simplified bounding shapes centered on Pacific Palisades
// (~-118.52, 34.04) and growing northwest toward Malibu and east toward
// the US-101 corridor.
//
// Pre-computed safe routes:
//   T0–T1  Fire is small; US-101 Coastal is clear (low risk).
//   T2–T4  Fire engulfs the coastal corridor; route reroutes inland via
//          I-405 N → CA-118 W → US-101 N, well clear of the perimeter.

export const FIRE_SNAPSHOTS: FireSnapshot[] = [
  {
    index: 0,
    label: 'Jan 7 · 06:00',
    routeBlocked: false,
    routeName: 'US-101 Coastal',
    routeRisk: 'low',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.4800, 34.0600],
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
                [-118.510, 34.055],
                [-118.510, 34.025],
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
    label: 'Jan 7 · 10:00',
    routeBlocked: false,
    routeName: 'US-101 Coastal',
    routeRisk: 'low',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.4800, 34.0600],
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
                [-118.610, 34.080],
                [-118.480, 34.080],
                [-118.480, 34.005],
                [-118.610, 34.005],
                [-118.610, 34.080],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 2,
    label: 'Jan 7 · 14:00',
    routeBlocked: true,
    routeName: 'I-405 N · CA-118 W · US-101 N (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3900, 34.0700],
        [-118.4600, 34.1600],
        [-118.5500, 34.2700],
        [-118.7200, 34.2800],
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
                [-118.690, 34.100],
                [-118.465, 34.100],
                [-118.465, 33.990],
                [-118.690, 33.990],
                [-118.690, 34.100],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 3,
    label: 'Jan 7 · 18:00',
    routeBlocked: true,
    routeName: 'I-405 N · CA-118 W · US-101 N (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3900, 34.0700],
        [-118.4600, 34.1600],
        [-118.5500, 34.2700],
        [-118.7200, 34.2800],
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
                [-118.790, 34.125],
                [-118.435, 34.125],
                [-118.435, 33.975],
                [-118.790, 33.975],
                [-118.790, 34.125],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    index: 4,
    label: 'Jan 7 · 22:00',
    routeBlocked: true,
    routeName: 'I-405 N · CA-118 W · US-101 N (Rerouted)',
    routeRisk: 'moderate',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-118.2437, 34.0522],
        [-118.3900, 34.0700],
        [-118.4600, 34.1600],
        [-118.5500, 34.2700],
        [-118.7200, 34.2800],
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
                [-118.910, 34.145],
                [-118.415, 34.145],
                [-118.415, 33.955],
                [-118.910, 33.955],
                [-118.910, 34.145],
              ],
            ],
          },
        },
      ],
    },
  },
];

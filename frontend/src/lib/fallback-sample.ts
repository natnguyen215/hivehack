import type {
  FireImpact,
  GeoOverlay,
  KeyIncident,
  LiveUpdate,
  RouteResponse,
  WildfireStatus,
} from '@/types';

type FallbackNarrative = {
  title: string;
  summary: string;
  timestampLabel: string;
};

type FallbackSample = {
  fetched_at: string;
  status: WildfireStatus;
  updates: LiveUpdate[];
  keyIncidents: KeyIncident[];
  overlays: GeoOverlay[];
  routeData: RouteResponse;
  routeImpacts: Record<string, FireImpact>;
  defaultSelectedRouteId: string;
  narrative: FallbackNarrative;
};

const fetchedAt = '2026-04-11T18:00:00Z';

export const FALLBACK_SAMPLE: FallbackSample = {
  fetched_at: fetchedAt,
  status: {
    level: 'critical',
    advisory:
      'Sample fallback payload: Topanga Canyon is treated as an active perimeter so the alternate corridor can be demoed without live dependencies.',
    active_fires: 2,
    counties: ['Los Angeles', 'Ventura', 'Santa Barbara'],
    updated_at: fetchedAt,
  },
  updates: [
    {
      id: 'fallback-update-1',
      category: 'fire',
      severity: 'critical',
      message: 'Sample perimeter covers Topanga Canyon to demonstrate route avoidance in fallback mode.',
      timestamp: '2026-04-11T18:05:00Z',
    },
    {
      id: 'fallback-update-2',
      category: 'road',
      severity: 'high',
      message: 'Canyon corridor treated as blocked in the sample so the inland alternate stays visible on the map.',
      timestamp: '2026-04-11T17:55:00Z',
    },
    {
      id: 'fallback-update-3',
      category: 'evac',
      severity: 'moderate',
      message: 'Mandatory sample evacuation zone wraps the canyon mouth and nearby ridgelines.',
      timestamp: '2026-04-11T17:40:00Z',
    },
  ],
  keyIncidents: [
    {
      id: 'fallback-topanga',
      name: 'Topanga Canyon Fire',
      acres: 6400,
      severity: 'critical',
      updated_at: fetchedAt,
      display_status: 'Active perimeter',
    },
    {
      id: 'fallback-ridge',
      name: 'Calabasas Ridge Spot Fire',
      acres: 900,
      severity: 'moderate',
      updated_at: fetchedAt,
      display_status: 'Contained flank',
    },
  ],
  overlays: [
    {
      id: 'fire_perimeters',
      name: 'Fire Perimeters',
      category: 'fire',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              id: 'fallback-topanga',
              name: 'Topanga Canyon Fire',
              severity: 'critical',
              acres: 6400,
              updated_at: fetchedAt,
              display_status: 'Active perimeter',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-118.67, 34.13],
                  [-118.585, 34.13],
                  [-118.585, 34.055],
                  [-118.67, 34.055],
                  [-118.67, 34.13],
                ],
              ],
            },
          },
        ],
      },
    },
    {
      id: 'evacuation_zones',
      name: 'Evacuation Zones',
      category: 'evacuation',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Topanga Canyon Zone A',
              zone_id: 'TC-A',
              status: 'mandatory',
              issued_at: '2026-04-11T16:00:00Z',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-118.69, 34.145],
                  [-118.575, 34.145],
                  [-118.575, 34.04],
                  [-118.69, 34.04],
                  [-118.69, 34.145],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            properties: {
              name: 'Calabasas Advisory Zone',
              zone_id: 'CAL-1',
              status: 'voluntary',
              issued_at: '2026-04-11T17:30:00Z',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-118.69, 34.19],
                  [-118.56, 34.19],
                  [-118.56, 34.135],
                  [-118.69, 34.135],
                  [-118.69, 34.19],
                ],
              ],
            },
          },
        ],
      },
    },
    {
      id: 'smoke_plumes',
      name: 'Smoke Plumes',
      category: 'smoke',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Topanga Smoke Plume',
              density: 'heavy',
              satellite: 'GOES-18',
              observed_at: '2026-04-11T17:00:00Z',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-118.73, 34.16],
                  [-118.56, 34.205],
                  [-118.39, 34.18],
                  [-118.45, 34.085],
                  [-118.62, 34.07],
                  [-118.73, 34.16],
                ],
              ],
            },
          },
        ],
      },
    },
  ],
  routeData: {
    recommended: {
      id: 'us-101',
      name: 'US-101 Coastal',
      distance_miles: 92.4,
      duration_minutes: 108,
      risk: 'high',
      segments: [
        {
          name: 'Downtown LA to Topanga Canyon',
          distance_miles: 31.8,
          duration_minutes: 40,
          risk: 'high',
        },
        {
          name: 'Topanga Canyon to Santa Barbara',
          distance_miles: 60.6,
          duration_minutes: 68,
          risk: 'moderate',
        },
      ],
      geometry: {
        type: 'LineString',
        coordinates: [
          [-118.2437, 34.0522],
          [-118.395, 34.018],
          [-118.4912, 34.0195],
          [-118.612, 34.095],
          [-118.837, 34.1706],
          [-119.229, 34.2746],
          [-119.6982, 34.4208],
        ],
      },
    },
    alternatives: [
      {
        id: 'ca-14',
        name: 'I-5 / CA-126 Inland',
        distance_miles: 109.8,
        duration_minutes: 128,
        risk: 'low',
        segments: [
          {
            name: 'Downtown LA to Santa Clarita',
            distance_miles: 37.9,
            duration_minutes: 42,
            risk: 'low',
          },
          {
            name: 'Santa Clarita to Ventura via CA-126',
            distance_miles: 39.8,
            duration_minutes: 47,
            risk: 'low',
          },
          {
            name: 'Ventura to Santa Barbara',
            distance_miles: 32.1,
            duration_minutes: 39,
            risk: 'low',
          },
        ],
        geometry: {
          type: 'LineString',
          coordinates: [
            [-118.2437, 34.0522],
            [-118.281, 34.153],
            [-118.438, 34.283],
            [-118.63, 34.308],
            [-118.882, 34.283],
            [-119.04, 34.216],
            [-119.229, 34.2746],
            [-119.6982, 34.4208],
          ],
        },
      },
    ],
    fire_impact: {
      blocked: true,
      impacted_incidents: ['Topanga Canyon Fire'],
      overlap_segments: 2,
    },
  },
  routeImpacts: {
    'us-101': {
      blocked: true,
      impacted_incidents: ['Topanga Canyon Fire'],
      overlap_segments: 2,
    },
    'ca-14': {
      blocked: false,
      impacted_incidents: [],
      overlap_segments: 0,
    },
  },
  defaultSelectedRouteId: 'ca-14',
  narrative: {
    title: 'Topanga Canyon fallback sample',
    summary:
      'This static payload mirrors the app fallback path when live routing or overlays degrade. The coastal line is left in place so the inland alternative can visibly dodge the canyon closure.',
    timestampLabel: 'Sample snapshot | Apr 11, 2026 | 6:00 PM',
  },
};

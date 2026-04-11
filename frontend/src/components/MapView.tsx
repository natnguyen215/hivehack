'use client';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { memo, useEffect, useRef, useState } from 'react';

import type { DataMode, RouteGeometry } from '@/types';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export type RouteDisplay = {
  id: string;
  geometry: RouteGeometry;
  selected: boolean;
};

type MapViewProps = {
  activeOverlays: Set<string>;
  routeGeometry: RouteGeometry | null;
  allRoutes?: RouteDisplay[];
  fireOverride?: GeoJSON.FeatureCollection | null;
  routeBlocked?: boolean;
  mode?: DataMode;
};

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_LAYER_ID = 'route-layer';
const LIVE_FIRE_SOURCE_ID = 'live-fire-source';
const LIVE_FIRE_FILL_LAYER_ID = 'live-fire-fill-layer';
const LIVE_FIRE_OUTLINE_LAYER_ID = 'live-fire-outline-layer';
const HISTORICAL_FIRE_SOURCE_ID = 'historical-fire-source';
const HISTORICAL_FIRE_FILL_LAYER_ID = 'historical-fire-fill-layer';
const HISTORICAL_FIRE_OUTLINE_LAYER_ID = 'historical-fire-outline-layer';

const ROUTE_COLORS = {
  selected: '#3b82f6',
  blocked: '#f97316',
  unselected: '#64748b',
} as const;

const fireFillColorExpression: any = [
  'case',
  ['==', ['downcase', ['to-string', ['coalesce', ['get', 'severity'], '']]], 'critical'],
  '#b91c1c',
  ['==', ['downcase', ['to-string', ['coalesce', ['get', 'severity'], '']]], 'high'],
  '#dc2626',
  ['==', ['downcase', ['to-string', ['coalesce', ['get', 'severity'], '']]], 'moderate'],
  '#f97316',
  ['==', ['downcase', ['to-string', ['coalesce', ['get', 'severity'], '']]], 'low'],
  '#f59e0b',
  [
    'step',
    ['coalesce', ['to-number', ['get', 'acres']], 0],
    '#fbbf24',
    1000,
    '#fb923c',
    5000,
    '#f97316',
    15000,
    '#ef4444',
    50000,
    '#b91c1c',
  ],
];

const fireFillOpacityExpression: any = [
  'step',
  ['coalesce', ['to-number', ['get', 'acres']], 0],
  0.3,
  1000,
  0.36,
  5000,
  0.43,
  15000,
  0.5,
];

function setFireLayerVisibility(
  map: mapboxgl.Map,
  fillLayerId: string,
  outlineLayerId: string,
  visible: boolean,
) {
  const visibility = visible ? 'visible' : 'none';
  if (map.getLayer(fillLayerId)) map.setLayoutProperty(fillLayerId, 'visibility', visibility);
  if (map.getLayer(outlineLayerId)) map.setLayoutProperty(outlineLayerId, 'visibility', visibility);
}

function ensureFireLayers(
  map: mapboxgl.Map,
  sourceId: string,
  fillLayerId: string,
  outlineLayerId: string,
  data: GeoJSON.FeatureCollection,
  visible: boolean,
) {
  const existingSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
  if (!existingSource) {
    map.addSource(sourceId, { type: 'geojson', data });
  } else {
    existingSource.setData(data);
  }

  if (!map.getLayer(fillLayerId)) {
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': fireFillColorExpression,
        'fill-opacity': fireFillOpacityExpression,
      },
      layout: { visibility: visible ? 'visible' : 'none' },
    });
  }

  if (!map.getLayer(outlineLayerId)) {
    map.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#7f1d1d',
        'line-width': 2.2,
        'line-opacity': 0.9,
      },
      layout: { visibility: visible ? 'visible' : 'none' },
    });
  }

  setFireLayerVisibility(map, fillLayerId, outlineLayerId, visible);
}

function upsertRoute(map: mapboxgl.Map, geometry: RouteGeometry | null, blocked: boolean) {
  if (!geometry) {
    if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
    if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    return;
  }

  const featureData: GeoJSON.Feature = { type: 'Feature', geometry, properties: {} };
  const existingSource = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

  if (!existingSource) {
    map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: featureData });
  } else {
    existingSource.setData(featureData);
  }

  const color = blocked ? ROUTE_COLORS.blocked : ROUTE_COLORS.selected;
  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      paint: {
        'line-color': color,
        'line-width': 4,
      },
    });
  } else {
    map.setPaintProperty(ROUTE_LAYER_ID, 'line-color', color);
  }
}

function syncMultiRoutes(
  map: mapboxgl.Map,
  routes: RouteDisplay[],
  blocked: boolean,
  managedIds: Set<string>,
) {
  const activeIds = new Set(routes.map((route) => route.id));
  const staleIds: string[] = [];

  for (const id of managedIds) {
    if (!activeIds.has(id)) staleIds.push(id);
  }

  for (const id of staleIds) {
    const layerId = `route-multi-${id}-layer`;
    const sourceId = `route-multi-${id}-source`;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    managedIds.delete(id);
  }

  const sorted = [...routes].sort((a, b) => Number(a.selected) - Number(b.selected));

  for (const route of sorted) {
    const sourceId = `route-multi-${route.id}-source`;
    const layerId = `route-multi-${route.id}-layer`;
    const feature: GeoJSON.Feature = { type: 'Feature', geometry: route.geometry, properties: {} };

    const color = route.selected
      ? blocked
        ? ROUTE_COLORS.blocked
        : ROUTE_COLORS.selected
      : ROUTE_COLORS.unselected;
    const width = route.selected ? 5 : 3;
    const opacity = route.selected ? 1 : 0.52;

    const existingSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    if (!existingSource) {
      map.addSource(sourceId, { type: 'geojson', data: feature });
    } else {
      existingSource.setData(feature);
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': width,
          'line-opacity': opacity,
        },
      });
    } else {
      map.setPaintProperty(layerId, 'line-color', color);
      map.setPaintProperty(layerId, 'line-width', width);
      map.setPaintProperty(layerId, 'line-opacity', opacity);
      if (route.selected) map.moveLayer(layerId);
    }

    managedIds.add(route.id);
  }
}

function removeAllMultiRoutes(map: mapboxgl.Map, managedIds: Set<string>) {
  for (const id of managedIds) {
    const layerId = `route-multi-${id}-layer`;
    const sourceId = `route-multi-${id}-source`;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
  managedIds.clear();
}

function getPolygonBounds(featureCollection: GeoJSON.FeatureCollection): mapboxgl.LngLatBounds | null {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoordinates = false;

  for (const feature of featureCollection.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    let rings: number[][][] = [];

    if (geometry.type === 'Polygon') {
      rings = geometry.coordinates;
    } else if (geometry.type === 'MultiPolygon') {
      rings = geometry.coordinates.flat();
    }

    for (const ring of rings) {
      for (const coordinate of ring) {
        bounds.extend(coordinate as [number, number]);
        hasCoordinates = true;
      }
    }
  }

  return hasCoordinates ? bounds : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstValue(props: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null && String(props[key]).trim()) {
      return props[key];
    }
  }
  return undefined;
}

function getNumeric(props: Record<string, unknown>, keys: string[]) {
  const raw = firstValue(props, keys);
  if (raw === undefined) return undefined;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function buildPopupHtml(props: Record<string, unknown>) {
  const nameRaw = firstValue(props, ['name', 'incident_name', 'incident', 'poly_IncidentName', 'FIRE_NAME']);
  const statusRaw = firstValue(props, ['status', 'state', 'incident_status', 'poly_Status']);
  const timestampRaw = firstValue(props, ['timestamp', 'updated_at', 'poly_DateCurrent', 'DATE_CURRENT']);
  const severityRaw = firstValue(props, ['severity', 'risk', 'risk_level']);
  const acres = getNumeric(props, ['acres', 'gis_acres', 'poly_GISAcres', 'GIS_ACRES']);

  const name = escapeHtml(String(nameRaw ?? 'Fire Perimeter'));
  const timestamp = timestampRaw
    ? `<div style="color:#94a3b8;margin-top:2px;">${escapeHtml(String(timestampRaw))}</div>`
    : '';
  const status = statusRaw
    ? `<div style="color:#cbd5e1;margin-top:2px;">Status: ${escapeHtml(String(statusRaw))}</div>`
    : '';
  const severity = severityRaw
    ? `<div style="color:#fca5a5;margin-top:2px;">Severity: ${escapeHtml(String(severityRaw))}</div>`
    : '';
  const acresMarkup = typeof acres === 'number'
    ? `<div style="color:#fca5a5;font-weight:600;margin-top:3px;">${Math.round(acres).toLocaleString()} acres</div>`
    : '';

  return `<div style="font-family:system-ui;font-size:12px;padding:2px 4px;background:#1e293b;color:#f1f5f9;border-radius:6px;">
    <strong style="font-size:13px;">${name}</strong>${timestamp}${status}${severity}${acresMarkup}
  </div>`;
}

function MapView({
  activeOverlays,
  routeGeometry,
  allRoutes = [],
  fireOverride,
  routeBlocked = false,
  mode = 'live',
}: MapViewProps) {
  const resolvedMode = mode;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const managedRouteIdsRef = useRef<Set<string>>(new Set());
  const lastBoundsKeyRef = useRef<Record<DataMode, string>>({ live: '', historical: '' });

  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-118.52, 34.04],
      zoom: 9,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      setMapReady(true);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const managedIds = managedRouteIdsRef.current;

    if (allRoutes.length > 0) {
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      syncMultiRoutes(map, allRoutes, routeBlocked, managedIds);
      return;
    }

    removeAllMultiRoutes(map, managedIds);
    upsertRoute(map, routeGeometry, routeBlocked);
  }, [allRoutes, mapReady, routeBlocked, routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (resolvedMode === 'live' && fireOverride) {
      ensureFireLayers(
        map,
        LIVE_FIRE_SOURCE_ID,
        LIVE_FIRE_FILL_LAYER_ID,
        LIVE_FIRE_OUTLINE_LAYER_ID,
        fireOverride,
        activeOverlays.has('fire_perimeters'),
      );
    } else {
      setFireLayerVisibility(map, LIVE_FIRE_FILL_LAYER_ID, LIVE_FIRE_OUTLINE_LAYER_ID, false);
    }
  }, [activeOverlays, fireOverride, mapReady, resolvedMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (resolvedMode === 'historical' && fireOverride) {
      ensureFireLayers(
        map,
        HISTORICAL_FIRE_SOURCE_ID,
        HISTORICAL_FIRE_FILL_LAYER_ID,
        HISTORICAL_FIRE_OUTLINE_LAYER_ID,
        fireOverride,
        true,
      );
    } else {
      setFireLayerVisibility(map, HISTORICAL_FIRE_FILL_LAYER_ID, HISTORICAL_FIRE_OUTLINE_LAYER_ID, false);
    }
  }, [fireOverride, mapReady, resolvedMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!fireOverride) return;
    const focusData = fireOverride;

    const bounds = getPolygonBounds(focusData);
    if (!bounds) return;

    const boundsKey = `${bounds.getWest().toFixed(3)},${bounds.getSouth().toFixed(3)},${bounds.getEast().toFixed(3)},${bounds.getNorth().toFixed(3)}`;
    if (boundsKey === lastBoundsKeyRef.current[resolvedMode]) return;

    lastBoundsKeyRef.current[resolvedMode] = boundsKey;
    map.fitBounds(bounds, {
      padding: 120,
      duration: 600,
      maxZoom: 11,
    });
  }, [fireOverride, mapReady, resolvedMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });
    }

    const popup = popupRef.current;
    type LayerMouseEvent = mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] };

    const onMove = (event: LayerMouseEvent) => {
      map.getCanvas().style.cursor = 'crosshair';
      const props = event.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!props) return;

      popup.setLngLat(event.lngLat).setHTML(buildPopupHtml(props)).addTo(map);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    const trackedLayerIds: string[] = [];
    const layerCandidates = [LIVE_FIRE_FILL_LAYER_ID, HISTORICAL_FIRE_FILL_LAYER_ID];

    for (const layerId of layerCandidates) {
      if (!map.getLayer(layerId)) continue;
      map.on('mousemove', layerId, onMove);
      map.on('mouseleave', layerId, onLeave);
      trackedLayerIds.push(layerId);
    }

    return () => {
      for (const layerId of trackedLayerIds) {
        map.off('mousemove', layerId, onMove);
        map.off('mouseleave', layerId, onLeave);
      }
      popup.remove();
    };
  }, [fireOverride, mapReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export default memo(MapView);

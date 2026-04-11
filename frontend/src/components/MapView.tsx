'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { fetchOverlays } from '@/lib/api';
import type { GeoOverlay, RouteGeometry } from '@/types';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type MapViewProps = {
  activeOverlays: Set<string>;
  routeGeometry: RouteGeometry | null;
  fireOverride?: GeoJSON.FeatureCollection | null;
  routeBlocked?: boolean;
};

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_LAYER_ID = 'route-layer';
const FIRE_SOURCE_ID = 'fire_perimeters-source';
const FIRE_LAYER_ID = 'fire_perimeters-layer';

const overlayPaint = {
  evac_zones: {
    type: 'fill' as const,
    paint: {
      'fill-color': '#fb923c',
      'fill-opacity': 0.4,
    },
  },
  fire_perimeters: {
    type: 'fill' as const,
    paint: {
      'fill-color': '#ef4444',
      'fill-opacity': 0.35,
      'fill-outline-color': '#b91c1c',
    },
  },
  smoke_regions: {
    type: 'fill' as const,
    paint: {
      'fill-color': '#94a3b8',
      'fill-opacity': 0.3,
    },
  },
  road_closures: {
    type: 'line' as const,
    paint: {
      'line-color': '#ef4444',
      'line-width': 2,
      'line-dasharray': [1.5, 1.5],
    },
  },
} satisfies Record<
  string,
  { type: 'fill' | 'line'; paint: mapboxgl.FillPaint | mapboxgl.LinePaint }
>;

function addOverlay(map: mapboxgl.Map, overlay: GeoOverlay) {
  const sourceId = `${overlay.id}-source`;
  const layerId = `${overlay.id}-layer`;
  const paintKey = overlay.id as keyof typeof overlayPaint;

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: overlay.data });
  }

  if (!map.getLayer(layerId)) {
    const style = overlayPaint[paintKey];
    if (!style) return;
    map.addLayer({ id: layerId, type: style.type, source: sourceId, paint: style.paint });
  }
}

function removeOverlay(map: mapboxgl.Map, overlayId: string) {
  const sourceId = `${overlayId}-source`;
  const layerId = `${overlayId}-layer`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function syncOverlays(map: mapboxgl.Map, overlays: Record<string, GeoOverlay>, active: Set<string>) {
  Object.keys(overlays).forEach((id) => {
    if (active.has(id)) addOverlay(map, overlays[id]);
    else removeOverlay(map, id);
  });
}

// Blue for clear routes, ember-orange for rerouted ones.
function routeColor(blocked: boolean) {
  return blocked ? '#f97316' : '#3b82f6';
}

function upsertRoute(map: mapboxgl.Map, geometry: RouteGeometry | null, blocked: boolean) {
  if (!geometry) {
    if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
    if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    return;
  }

  const featureData: GeoJSON.Feature = { type: 'Feature', geometry, properties: {} };

  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: featureData });
  } else {
    (map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(featureData);
  }

  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      paint: { 'line-color': routeColor(blocked), 'line-width': 4 },
    });
  } else {
    map.setPaintProperty(ROUTE_LAYER_ID, 'line-color', routeColor(blocked));
  }
}

// Compute a tight bounding box from any FeatureCollection with Polygon/MultiPolygon features.
function getPolygonBounds(fc: GeoJSON.FeatureCollection): mapboxgl.LngLatBounds | null {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoords = false;

  for (const feature of fc.features) {
    const geom = feature.geometry;
    let rings: number[][][] = [];
    if (geom.type === 'Polygon') rings = geom.coordinates;
    else if (geom.type === 'MultiPolygon') rings = geom.coordinates.flat();

    for (const ring of rings) {
      for (const coord of ring) {
        bounds.extend(coord as [number, number]);
        hasCoords = true;
      }
    }
  }

  return hasCoords ? bounds : null;
}

function buildPopupHtml(props: Record<string, unknown>) {
  const name = String(props.name ?? 'Fire Perimeter');
  const timestamp = props.timestamp ? `<div style="color:#94a3b8;margin-top:2px;">${props.timestamp}</div>` : '';
  const acres = props.acres
    ? `<div style="color:#fca5a5;font-weight:600;margin-top:3px;">${Number(props.acres).toLocaleString()} acres</div>`
    : '';
  return `<div style="font-family:system-ui;font-size:12px;padding:2px 4px;background:#1e293b;color:#f1f5f9;border-radius:6px;">
    <strong style="font-size:13px;">${name}</strong>${timestamp}${acres}
  </div>`;
}

export default function MapView({ activeOverlays, routeGeometry, fireOverride, routeBlocked = false }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [overlays, setOverlays] = useState<Record<string, GeoOverlay>>({});
  const [mapReady, setMapReady] = useState(false);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-118.52, 34.04],
      zoom: 9,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const map = mapRef.current;
    map.on('load', async () => {
      setMapReady(true);
      try {
        const data = await fetchOverlays();
        const overlayMap = data.overlays.reduce<Record<string, GeoOverlay>>((acc, o: GeoOverlay) => {
          acc[o.id] = o;
          return acc;
        }, {});
        setOverlays(overlayMap);
        syncOverlays(map, overlayMap, activeOverlays);
      } catch (err) {
        console.error('Failed to load overlays', err);
      }
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [activeOverlays]);

  // Sync overlay visibility when the active set or loaded overlays change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncOverlays(map, overlays, activeOverlays);
  }, [activeOverlays, mapReady, overlays]);

  // Update route line; change color to orange when rerouted.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    upsertRoute(map, routeGeometry, routeBlocked);
  }, [routeGeometry, mapReady, routeBlocked]);

  // Hot-swap the fire polygon and fit the map to the new perimeter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !fireOverride) return;

    const source = map.getSource(FIRE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) source.setData(fireOverride);

    const bounds = getPolygonBounds(fireOverride);
    if (bounds) {
      map.fitBounds(bounds, { padding: 120, duration: 600, maxZoom: 11 });
    }
  }, [fireOverride, mapReady]);

  // Attach/reattach hover popup on the fire layer whenever the map or overlays update.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(FIRE_LAYER_ID)) return;

    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });
    }
    const popup = popupRef.current;

    type LayerMouseEvent = mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] };
    const onMove = (e: LayerMouseEvent) => {
      map.getCanvas().style.cursor = 'crosshair';
      const props = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (props) {
        popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(props)).addTo(map);
      }
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    map.on('mousemove', FIRE_LAYER_ID, onMove);
    map.on('mouseleave', FIRE_LAYER_ID, onLeave);

    return () => {
      map.off('mousemove', FIRE_LAYER_ID, onMove);
      map.off('mouseleave', FIRE_LAYER_ID, onLeave);
      popup.remove();
    };
  }, [mapReady, overlays]);


  return <div ref={containerRef} className="h-[700px] w-full rounded-lg" />;
}


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
};

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_LAYER_ID = 'route-layer';

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

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: overlay.data,
    });
  }

  if (!map.getLayer(layerId)) {
    const style = overlayPaint[overlay.id as keyof typeof overlayPaint];
    if (!style) return;
    map.addLayer({
      id: layerId,
      type: style.type,
      source: sourceId,
      paint: style.paint,
    });
  }
}

function removeOverlay(map: mapboxgl.Map, overlayId: string) {
  const sourceId = `${overlayId}-source`;
  const layerId = `${overlayId}-layer`;

  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function syncOverlays(map: mapboxgl.Map, overlays: Record<string, GeoOverlay>, active: Set<string>) {
  Object.keys(overlays).forEach((overlayId) => {
    if (active.has(overlayId)) {
      addOverlay(map, overlays[overlayId]);
    } else {
      removeOverlay(map, overlayId);
    }
  });
}

function upsertRoute(map: mapboxgl.Map, geometry: RouteGeometry | null) {
  if (!geometry) {
    if (map.getLayer(ROUTE_LAYER_ID)) {
      map.removeLayer(ROUTE_LAYER_ID);
    }
    if (map.getSource(ROUTE_SOURCE_ID)) {
      map.removeSource(ROUTE_SOURCE_ID);
    }
    return;
  }

  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry,
        properties: {},
      },
    });
  } else {
    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    source.setData({
      type: 'Feature',
      geometry,
      properties: {},
    });
  }

  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4,
      },
    });
  }
}

export default function MapView({ activeOverlays, routeGeometry }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [overlays, setOverlays] = useState<Record<string, GeoOverlay>>({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-118.2, 34.05],
      zoom: 8,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const map = mapRef.current;
    map.on('load', async () => {
      setMapReady(true);
      try {
        const data = await fetchOverlays();
        const overlayMap = data.overlays.reduce<Record<string, GeoOverlay>>((acc, overlay) => {
          acc[overlay.id] = overlay;
          return acc;
        }, {});
        setOverlays(overlayMap);
        syncOverlays(map, overlayMap, activeOverlays);
      } catch (error) {
        console.error('Failed to load overlays', error);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncOverlays(map, overlays, activeOverlays);
  }, [activeOverlays, mapReady, overlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    upsertRoute(map, routeGeometry);
  }, [routeGeometry, mapReady]);

  return <div ref={containerRef} className="h-[700px] w-full rounded-lg" />;
}

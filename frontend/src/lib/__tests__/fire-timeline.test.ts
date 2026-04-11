import { describe, it, expect } from 'vitest';
import { FIRE_SNAPSHOTS } from '../fire-timeline';

describe('FIRE_SNAPSHOTS', () => {
  it('contains exactly 5 snapshots', () => {
    expect(FIRE_SNAPSHOTS).toHaveLength(5);
  });

  it('snapshots have sequential, zero-based indexes', () => {
    FIRE_SNAPSHOTS.forEach((snap, i) => {
      expect(snap.index).toBe(i);
    });
  });

  it('every snapshot has a non-empty label', () => {
    FIRE_SNAPSHOTS.forEach((snap) => {
      expect(snap.label.trim()).not.toBe('');
    });
  });

  it('every snapshot has a valid FeatureCollection with at least one feature', () => {
    FIRE_SNAPSHOTS.forEach((snap) => {
      expect(snap.geojson.type).toBe('FeatureCollection');
      expect(snap.geojson.features.length).toBeGreaterThan(0);
    });
  });

  it('every fire polygon is a valid closed ring (first coord === last coord)', () => {
    FIRE_SNAPSHOTS.forEach((snap) => {
      snap.geojson.features.forEach((feature) => {
        expect(feature.geometry.type).toBe('Polygon');
        const polygon = feature.geometry as GeoJSON.Polygon;
        polygon.coordinates.forEach((ring) => {
          const first = ring[0];
          const last = ring[ring.length - 1];
          expect(first[0]).toBe(last[0]);
          expect(first[1]).toBe(last[1]);
        });
      });
    });
  });

  it('fire perimeter grows — bounding box west edge moves further west each step', () => {
    const westEdges = FIRE_SNAPSHOTS.map((snap) => {
      const polygon = snap.geojson.features[0].geometry as GeoJSON.Polygon;
      return Math.min(...polygon.coordinates[0].map((c) => c[0]));
    });
    // Each snapshot's western longitude should be <= the previous (more negative = further west)
    for (let i = 1; i < westEdges.length; i++) {
      expect(westEdges[i]).toBeLessThanOrEqual(westEdges[i - 1]);
    }
  });

  it('first two snapshots have routeBlocked = false', () => {
    expect(FIRE_SNAPSHOTS[0].routeBlocked).toBe(false);
    expect(FIRE_SNAPSHOTS[1].routeBlocked).toBe(false);
  });

  it('last three snapshots have routeBlocked = true', () => {
    expect(FIRE_SNAPSHOTS[2].routeBlocked).toBe(true);
    expect(FIRE_SNAPSHOTS[3].routeBlocked).toBe(true);
    expect(FIRE_SNAPSHOTS[4].routeBlocked).toBe(true);
  });

  it('every snapshot has a LineString route geometry with at least 2 coordinates', () => {
    FIRE_SNAPSHOTS.forEach((snap) => {
      expect(snap.routeGeometry.type).toBe('LineString');
      expect(snap.routeGeometry.coordinates.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('all snapshots start from Downtown LA', () => {
    const [downtownLng, downtownLat] = [-118.2437, 34.0522];
    FIRE_SNAPSHOTS.forEach((snap) => {
      const [lng, lat] = snap.routeGeometry.coordinates[0];
      expect(lng).toBeCloseTo(downtownLng, 3);
      expect(lat).toBeCloseTo(downtownLat, 3);
    });
  });

  it('rerouted snapshots use a different route name than clear snapshots', () => {
    const clearName = FIRE_SNAPSHOTS[0].routeName;
    const reroutedName = FIRE_SNAPSHOTS[2].routeName;
    expect(reroutedName).not.toBe(clearName);
  });

  it('rerouted snapshots have moderate risk', () => {
    FIRE_SNAPSHOTS.filter((s) => s.routeBlocked).forEach((snap) => {
      expect(snap.routeRisk).toBe('moderate');
    });
  });

  it('clear snapshots have low risk', () => {
    FIRE_SNAPSHOTS.filter((s) => !s.routeBlocked).forEach((snap) => {
      expect(snap.routeRisk).toBe('low');
    });
  });
});

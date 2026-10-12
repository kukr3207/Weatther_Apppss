import { describe, expect, it } from 'vitest';
import {
  createMapLayerStack,
  defaultWeatherLayers,
  mapAttributions,
  parseMapLayerStack,
  reorderMapLayer,
  serializeMapLayerStack,
  updateMapLayer,
  visibleMapLayers,
} from './layers';
import {
  createRadarTimeline,
  mergeRadarTimelines,
  nearestRadarFrame,
  radarAvailability,
  radarFrameAt,
  radarPlaybackMarkers,
} from './radarTimeline';
import {
  clusterMapPoints,
  coordinateToWorld,
  fitViewport,
  metersPerPixel,
  pointInBounds,
  viewportBounds,
  worldToCoordinate,
} from './viewport';

describe('map viewport calculations', () => {
  it('round-trips coordinates through world space', () => {
    const coordinate = { latitude: 12.9716, longitude: 77.5946 };
    const result = worldToCoordinate(coordinateToWorld(coordinate, 10), 10);
    expect(result.latitude).toBeCloseTo(coordinate.latitude, 6);
    expect(result.longitude).toBeCloseTo(coordinate.longitude, 6);
  });

  it('keeps longitudes in the conventional range', () => {
    const result = coordinateToWorld({ latitude: 0, longitude: 180 }, 1);
    expect(worldToCoordinate(result, 1).longitude).toBe(-180);
  });

  it('reports smaller ground resolution at higher zoom', () => {
    expect(metersPerPixel(0, 10)).toBeLessThan(metersPerPixel(0, 5));
  });

  it('fits a single point at a useful zoom', () => {
    const result = fitViewport([{ latitude: 12, longitude: 77 }], { width: 800, height: 600 });
    expect(result.center).toEqual({ latitude: 12, longitude: 77 });
    expect(result.zoom).toBe(12);
  });

  it('fits multiple cities inside a viewport', () => {
    const result = fitViewport([
      { latitude: 12.9716, longitude: 77.5946 },
      { latitude: 19.076, longitude: 72.8777 },
      { latitude: 28.6139, longitude: 77.209 },
    ], { width: 1000, height: 700 });
    expect(result.center.latitude).toBeGreaterThan(12);
    expect(result.bounds.south).toBeCloseTo(12.9716);
    expect(result.bounds.north).toBeCloseTo(28.6139);
    expect(result.zoom).toBeGreaterThan(3);
  });

  it('uses short antimeridian bounds', () => {
    const result = fitViewport([
      { latitude: 10, longitude: 179 },
      { latitude: 11, longitude: -179 },
    ], { width: 1000, height: 700 });
    expect(result.bounds.crossesAntimeridian).toBe(true);
    expect(Math.abs(result.center.longitude)).toBeCloseTo(180, 0);
  });

  it('derives bounds from a viewport', () => {
    const bounds = viewportBounds({ center: { latitude: 0, longitude: 0 }, zoom: 3 }, { width: 800, height: 600 });
    expect(bounds.north).toBeGreaterThan(0);
    expect(bounds.south).toBeLessThan(0);
  });

  it('recognizes points inside ordinary bounds', () => {
    expect(pointInBounds({ latitude: 10, longitude: 10 }, {
      south: 0, west: 0, north: 20, east: 20, crossesAntimeridian: false,
    })).toBe(true);
  });

  it('recognizes points inside antimeridian bounds', () => {
    const bounds = { south: -20, west: 170, north: 20, east: -170, crossesAntimeridian: true };
    expect(pointInBounds({ latitude: 0, longitude: 179 }, bounds)).toBe(true);
    expect(pointInBounds({ latitude: 0, longitude: 0 }, bounds)).toBe(false);
  });

  it('clusters nearby points while retaining identities', () => {
    const clusters = clusterMapPoints([
      { id: 'a', latitude: 12.97, longitude: 77.59 },
      { id: 'b', latitude: 12.971, longitude: 77.591 },
      { id: 'c', latitude: 28.61, longitude: 77.2 },
    ], { zoom: 5, radiusPixels: 50 });
    expect(clusters.reduce((count, cluster) => count + cluster.count, 0)).toBe(3);
    expect(clusters.some((cluster) => cluster.pointIds.includes('a'))).toBe(true);
  });
});

describe('radar timelines', () => {
  const frames = [0, 1, 2].map((index) => ({
    id: `frame-${index}`,
    validAt: new Date(Date.parse('2026-10-11T12:00:00Z') + index * 300_000).toISOString(),
    tileUrl: `https://radar.test/${index}/{z}/{x}/{y}.png`,
    kind: index === 2 ? 'forecast' : 'observation',
  }));

  it('creates sorted timelines', () => {
    const timeline = createRadarTimeline([...frames].reverse(), { intervalMs: 500, holdLastMs: 1000 });
    expect(timeline.frames.map((frame) => frame.id)).toEqual(['frame-0', 'frame-1', 'frame-2']);
    expect(timeline.observedFrameCount).toBe(2);
    expect(timeline.forecastFrameCount).toBe(1);
    expect(timeline.durationMs).toBe(2000);
  });

  it('selects animation frames from elapsed time', () => {
    const timeline = createRadarTimeline(frames, { intervalMs: 500, holdLastMs: 1000 });
    expect(radarFrameAt(timeline, 0).index).toBe(0);
    expect(radarFrameAt(timeline, 700).index).toBe(1);
    expect(radarFrameAt(timeline, 1200).index).toBe(2);
  });

  it('loops elapsed playback time', () => {
    const timeline = createRadarTimeline(frames, { intervalMs: 500, holdLastMs: 500 });
    expect(radarFrameAt(timeline, timeline.durationMs).index).toBe(0);
  });

  it('holds the final frame without looping', () => {
    const timeline = createRadarTimeline(frames, { intervalMs: 500, holdLastMs: 500, loop: false });
    const result = radarFrameAt(timeline, 99_000);
    expect(result.index).toBe(2);
    expect(result.atEnd).toBe(true);
  });

  it('plays timelines in reverse', () => {
    const timeline = createRadarTimeline(frames, { direction: 'reverse' });
    expect(radarFrameAt(timeline, 0).frame.id).toBe('frame-2');
  });

  it('finds the nearest frame by time and kind', () => {
    const timeline = createRadarTimeline(frames);
    const result = nearestRadarFrame(timeline, '2026-10-11T12:09:00Z', { kind: 'forecast' });
    expect(result.frame.id).toBe('frame-2');
    expect(result.distanceMs).toBe(60_000);
  });

  it('applies maximum frame distance', () => {
    const timeline = createRadarTimeline(frames);
    expect(nearestRadarFrame(timeline, '2026-10-12T12:00:00Z', { maximumDistanceMs: 1000 })).toBeNull();
  });

  it('merges timelines without duplicate times', () => {
    const first = createRadarTimeline(frames.slice(0, 2));
    const second = createRadarTimeline(frames.slice(1));
    expect(mergeRadarTimelines([first, second]).frameCount).toBe(3);
  });

  it('creates localized playback markers', () => {
    const timeline = createRadarTimeline(frames);
    const markers = radarPlaybackMarkers(timeline, { labelEvery: 2, timezone: 'UTC' });
    expect(markers[0].label).toBeTruthy();
    expect(markers[1].label).toBeNull();
  });

  it('reports coverage for requested windows', () => {
    const timeline = createRadarTimeline(frames);
    const availability = radarAvailability(timeline, '2026-10-11T12:00:00Z', '2026-10-11T12:15:00Z');
    expect(availability.availableFrames).toBe(3);
    expect(availability.coverage).toBe(1);
  });
});

describe('map layer stacks', () => {
  it('creates stable z-index ordering', () => {
    const stack = createMapLayerStack([
      { id: 'top', name: 'Top', zIndex: 10 },
      { id: 'bottom', name: 'Bottom', zIndex: 0 },
    ]);
    expect(stack.layers.map((layer) => layer.id)).toEqual(['bottom', 'top']);
  });

  it('rejects duplicate ids', () => {
    expect(() => createMapLayerStack([{ id: 'same' }, { id: 'same' }])).toThrow('duplicated');
  });

  it('allows only one visible layer per exclusive group', () => {
    const stack = createMapLayerStack([
      { id: 'light', visible: true, exclusiveGroup: 'base' },
      { id: 'dark', visible: true, exclusiveGroup: 'base' },
    ]);
    expect(stack.layers.filter((layer) => layer.visible)).toHaveLength(1);
  });

  it('updates layer visibility and opacity', () => {
    const stack = createMapLayerStack([{ id: 'radar', opacity: 0.5 }]);
    const updated = updateMapLayer(stack, 'radar', { visible: false, opacity: 0.2 });
    expect(updated.layers[0]).toMatchObject({ visible: false, opacity: 0.2 });
  });

  it('switches exclusive layers when one is enabled', () => {
    const stack = createMapLayerStack([
      { id: 'light', visible: true, exclusiveGroup: 'base' },
      { id: 'dark', visible: false, exclusiveGroup: 'base' },
    ]);
    const updated = updateMapLayer(stack, 'dark', { visible: true });
    expect(updated.layers.find((layer) => layer.id === 'light').visible).toBe(false);
    expect(updated.layers.find((layer) => layer.id === 'dark').visible).toBe(true);
  });

  it('reorders layers and updates z-indexes', () => {
    const stack = createMapLayerStack([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const reordered = reorderMapLayer(stack, 'c', 0);
    expect(reordered.layers.map((layer) => layer.id)).toEqual(['c', 'a', 'b']);
  });

  it('filters visible layers by zoom and group', () => {
    const stack = createMapLayerStack([
      { id: 'cities', group: 'labels', minimumZoom: 5 },
      { id: 'radar', group: 'weather', maximumZoom: 12 },
      { id: 'hidden', visible: false },
    ]);
    expect(visibleMapLayers(stack, 4).map((layer) => layer.id)).toEqual(['radar']);
    expect(visibleMapLayers(stack, 8, { group: 'labels' }).map((layer) => layer.id)).toEqual(['cities']);
  });

  it('deduplicates visible attributions', () => {
    const stack = createMapLayerStack([
      { id: 'a', attribution: 'Provider' },
      { id: 'b', attribution: 'Provider' },
    ]);
    expect(mapAttributions(stack, 5)).toEqual(['Provider']);
  });

  it('round-trips serialized configurations', () => {
    const stack = defaultWeatherLayers();
    const parsed = parseMapLayerStack(serializeMapLayerStack(stack));
    expect(parsed.layers.map((layer) => layer.id)).toEqual(stack.layers.map((layer) => layer.id));
  });

  it('builds a useful default weather stack', () => {
    const stack = defaultWeatherLayers();
    expect(stack.layers.map((layer) => layer.id)).toEqual(['base-light', 'radar', 'alerts', 'saved-places']);
  });
});

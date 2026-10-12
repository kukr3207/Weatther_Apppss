import { assertArray, assertFiniteNumber, deepFreeze, normalizeCoordinates, round } from '../core/validation';

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;

function clampLatitude(value) {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, value));
}

function normalizeLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function coordinateToWorld(location, zoom = 0) {
  const { latitude, longitude } = normalizeCoordinates(location);
  const scale = TILE_SIZE * 2 ** assertFiniteNumber(zoom, 'Zoom', { minimum: 0, maximum: 30 });
  const limitedLatitude = clampLatitude(latitude);
  const sin = Math.sin(limitedLatitude * Math.PI / 180);
  return deepFreeze({
    x: ((normalizeLongitude(longitude) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    scale,
  });
}

export function worldToCoordinate(point, zoom = 0) {
  const scale = TILE_SIZE * 2 ** assertFiniteNumber(zoom, 'Zoom', { minimum: 0, maximum: 30 });
  const longitude = point.x / scale * 360 - 180;
  const value = Math.PI - 2 * Math.PI * point.y / scale;
  const latitude = 180 / Math.PI * Math.atan(0.5 * (Math.exp(value) - Math.exp(-value)));
  return deepFreeze({ latitude: clampLatitude(latitude), longitude: normalizeLongitude(longitude) });
}

export function metersPerPixel(latitude, zoom) {
  const circumference = 40_075_016.686;
  return circumference * Math.cos(clampLatitude(latitude) * Math.PI / 180) / (TILE_SIZE * 2 ** zoom);
}

function longitudeSpan(west, east) {
  const direct = east - west;
  return direct >= 0 ? direct : direct + 360;
}

export function fitViewport(inputLocations, dimensions, options = {}) {
  const locations = assertArray(inputLocations, 'Viewport locations', { nonEmpty: true }).map(normalizeCoordinates);
  const width = assertFiniteNumber(dimensions?.width, 'Viewport width', { minimum: 1 });
  const height = assertFiniteNumber(dimensions?.height, 'Viewport height', { minimum: 1 });
  const padding = assertFiniteNumber(options.padding ?? 32, 'Viewport padding', { minimum: 0 });
  const minimumZoom = options.minimumZoom ?? 0;
  const maximumZoom = options.maximumZoom ?? 20;
  if (locations.length === 1) {
    return deepFreeze({ center: locations[0], zoom: Math.min(maximumZoom, options.singlePointZoom ?? 12), bounds: null });
  }
  const latitudes = locations.map((location) => clampLatitude(location.latitude));
  const longitudes = locations.map((location) => normalizeLongitude(location.longitude)).sort((a, b) => a - b);
  let west = longitudes[0];
  let east = longitudes.at(-1);
  let maximumGap = -1;
  let gapIndex = -1;
  for (let index = 0; index < longitudes.length; index += 1) {
    const current = longitudes[index];
    const next = index === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[index + 1];
    const gap = next - current;
    if (gap > maximumGap) {
      maximumGap = gap;
      gapIndex = index;
    }
  }
  const wrappedSpan = 360 - maximumGap;
  if (wrappedSpan < east - west) {
    west = longitudes[(gapIndex + 1) % longitudes.length];
    east = longitudes[gapIndex];
    if (east < west) east += 360;
  }
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const westWorld = coordinateToWorld({ latitude: 0, longitude: west }, 0);
  const eastWorld = coordinateToWorld({ latitude: 0, longitude: normalizeLongitude(east) }, 0);
  let horizontalFraction = longitudeSpan(west, east) / 360;
  if (horizontalFraction <= 0) horizontalFraction = Math.abs(eastWorld.x - westWorld.x) / TILE_SIZE;
  const northWorld = coordinateToWorld({ latitude: north, longitude: 0 }, 0);
  const southWorld = coordinateToWorld({ latitude: south, longitude: 0 }, 0);
  const verticalFraction = Math.abs(southWorld.y - northWorld.y) / TILE_SIZE;
  const horizontalZoom = horizontalFraction > 0 ? Math.log2(availableWidth / TILE_SIZE / horizontalFraction) : maximumZoom;
  const verticalZoom = verticalFraction > 0 ? Math.log2(availableHeight / TILE_SIZE / verticalFraction) : maximumZoom;
  const zoom = Math.max(minimumZoom, Math.min(maximumZoom, horizontalZoom, verticalZoom));
  return deepFreeze({
    center: {
      latitude: round((south + north) / 2, 6),
      longitude: round(normalizeLongitude(west + longitudeSpan(west, east) / 2), 6),
    },
    zoom: round(zoom, 2),
    bounds: {
      south: round(south, 6),
      west: round(normalizeLongitude(west), 6),
      north: round(north, 6),
      east: round(normalizeLongitude(east), 6),
      crossesAntimeridian: east > 180 || normalizeLongitude(east) < normalizeLongitude(west),
    },
  });
}

export function viewportBounds(viewport, dimensions, options = {}) {
  const center = normalizeCoordinates(viewport.center ?? viewport);
  const zoom = assertFiniteNumber(viewport.zoom, 'Viewport zoom', { minimum: 0, maximum: 30 });
  const width = assertFiniteNumber(dimensions.width, 'Viewport width', { minimum: 1 });
  const height = assertFiniteNumber(dimensions.height, 'Viewport height', { minimum: 1 });
  const centerWorld = coordinateToWorld(center, zoom);
  const padding = options.padding ?? 0;
  const halfWidth = Math.max(0, width / 2 - padding);
  const halfHeight = Math.max(0, height / 2 - padding);
  const northWest = worldToCoordinate({ x: centerWorld.x - halfWidth, y: centerWorld.y - halfHeight }, zoom);
  const southEast = worldToCoordinate({ x: centerWorld.x + halfWidth, y: centerWorld.y + halfHeight }, zoom);
  return deepFreeze({
    south: southEast.latitude,
    west: northWest.longitude,
    north: northWest.latitude,
    east: southEast.longitude,
    crossesAntimeridian: northWest.longitude > southEast.longitude,
  });
}

export function pointInBounds(location, bounds) {
  const point = normalizeCoordinates(location);
  const latitudeMatches = point.latitude >= bounds.south && point.latitude <= bounds.north;
  const longitudeMatches = bounds.crossesAntimeridian
    ? point.longitude >= bounds.west || point.longitude <= bounds.east
    : point.longitude >= bounds.west && point.longitude <= bounds.east;
  return latitudeMatches && longitudeMatches;
}

export function clusterMapPoints(inputPoints, options = {}) {
  const zoom = options.zoom ?? 8;
  const radius = options.radiusPixels ?? 50;
  const groups = new Map();
  assertArray(inputPoints, 'Map points').forEach((point, index) => {
    const world = coordinateToWorld(point, zoom);
    const cellX = Math.floor(world.x / radius);
    const cellY = Math.floor(world.y / radius);
    const key = `${cellX}:${cellY}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...point, _index: index, _world: world });
  });
  return [...groups.values()].map((members, index) => deepFreeze({
    id: `cluster-${index + 1}`,
    count: members.length,
    center: {
      latitude: round(members.reduce((total, member) => total + member.latitude, 0) / members.length, 6),
      longitude: round(members.reduce((total, member) => total + member.longitude, 0) / members.length, 6),
    },
    pointIds: members.map((member) => member.id ?? member._index),
    points: members.map(({ _index, _world, ...point }) => point),
  }));
}

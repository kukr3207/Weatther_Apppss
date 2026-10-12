import { assertArray, assertFiniteNumber, assertObject, assertString, deepFreeze } from '../core/validation';
import { containsCoordinate, haversineDistance } from '../core/geo';

function normalizeGeofence(input, index = 0) {
  assertObject(input, `Geofence ${index + 1}`);
  const type = ['circle', 'bounds', 'polygon'].includes(input.type) ? input.type : 'circle';
  const normalized = {
    id: assertString(input.id, `Geofence ${index + 1} id`, { maximum: 160 }),
    name: assertString(input.name ?? input.id, `Geofence ${index + 1} name`, { maximum: 160 }),
    type,
    enabled: input.enabled !== false,
    alertRuleIds: Array.isArray(input.alertRuleIds) ? [...new Set(input.alertRuleIds)] : [],
  };
  if (type === 'circle') {
    normalized.center = {
      latitude: assertFiniteNumber(input.center?.latitude, 'Geofence latitude', { minimum: -90, maximum: 90 }),
      longitude: assertFiniteNumber(input.center?.longitude, 'Geofence longitude', { minimum: -180, maximum: 180 }),
    };
    normalized.radiusKm = assertFiniteNumber(input.radiusKm, 'Geofence radius', { minimum: 0.01, maximum: 5000 });
  }
  if (type === 'bounds') {
    normalized.bounds = {
      south: assertFiniteNumber(input.bounds?.south, 'South boundary', { minimum: -90, maximum: 90 }),
      west: assertFiniteNumber(input.bounds?.west, 'West boundary', { minimum: -180, maximum: 180 }),
      north: assertFiniteNumber(input.bounds?.north, 'North boundary', { minimum: -90, maximum: 90 }),
      east: assertFiniteNumber(input.bounds?.east, 'East boundary', { minimum: -180, maximum: 180 }),
    };
  }
  if (type === 'polygon') {
    normalized.points = assertArray(input.points, 'Geofence polygon', { nonEmpty: true }).map((point) => ({
      latitude: assertFiniteNumber(point.latitude, 'Polygon latitude', { minimum: -90, maximum: 90 }),
      longitude: assertFiniteNumber(point.longitude, 'Polygon longitude', { minimum: -180, maximum: 180 }),
    }));
    if (normalized.points.length < 3) throw new TypeError('A polygon geofence needs at least three points.');
  }
  return deepFreeze(normalized);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let first = 0, second = polygon.length - 1; first < polygon.length; second = first, first += 1) {
    const xFirst = polygon[first].longitude;
    const yFirst = polygon[first].latitude;
    const xSecond = polygon[second].longitude;
    const ySecond = polygon[second].latitude;
    const intersects = ((yFirst > point.latitude) !== (ySecond > point.latitude))
      && point.longitude < (xSecond - xFirst) * (point.latitude - yFirst) / (ySecond - yFirst) + xFirst;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function geofenceContains(geofenceInput, location) {
  const geofence = normalizeGeofence(geofenceInput);
  if (geofence.type === 'circle') return haversineDistance(geofence.center, location) <= geofence.radiusKm;
  if (geofence.type === 'bounds') return containsCoordinate(geofence.bounds, location);
  return pointInPolygon(location, geofence.points);
}

export function matchGeofences(geofencesInput, location) {
  return assertArray(geofencesInput, 'Geofences').map(normalizeGeofence)
    .filter((geofence) => geofence.enabled && geofenceContains(geofence, location));
}

export function geofenceTransitions(geofencesInput, previousLocation, currentLocation) {
  const geofences = assertArray(geofencesInput, 'Geofences').map(normalizeGeofence);
  return geofences.map((geofence) => {
    const wasInside = previousLocation ? geofenceContains(geofence, previousLocation) : false;
    const isInside = geofenceContains(geofence, currentLocation);
    return deepFreeze({
      geofence,
      wasInside,
      isInside,
      transition: wasInside === isInside ? 'none' : isInside ? 'entered' : 'exited',
    });
  }).filter((result) => result.transition !== 'none');
}

export function geofenceAlertRules(geofencesInput, location) {
  return [...new Set(matchGeofences(geofencesInput, location).flatMap((geofence) => geofence.alertRuleIds))];
}

export { normalizeGeofence };

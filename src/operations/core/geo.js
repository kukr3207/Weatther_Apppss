import { assertFiniteNumber, normalizeCoordinates } from './validation';

const EARTH_RADIUS_KM = 6371.0088;

function radians(degrees) {
  return degrees * Math.PI / 180;
}

function degrees(radiansValue) {
  return radiansValue * 180 / Math.PI;
}

export function normalizeLongitude(longitude) {
  const value = assertFiniteNumber(longitude, 'Longitude');
  return ((value + 540) % 360) - 180;
}

export function haversineDistance(first, second) {
  const from = normalizeCoordinates(first, 'Origin');
  const to = normalizeCoordinates(second, 'Destination');
  const latitudeDifference = radians(to.latitude - from.latitude);
  const longitudeDifference = radians(to.longitude - from.longitude);
  const firstLatitude = radians(from.latitude);
  const secondLatitude = radians(to.latitude);
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function initialBearing(first, second) {
  const from = normalizeCoordinates(first, 'Origin');
  const to = normalizeCoordinates(second, 'Destination');
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const longitudeDifference = radians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDifference) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDifference);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(origin, distanceKm, bearingDegrees) {
  const start = normalizeCoordinates(origin, 'Origin');
  const distance = assertFiniteNumber(distanceKm, 'Distance', { minimum: 0 });
  const bearing = radians(assertFiniteNumber(bearingDegrees, 'Bearing'));
  const angularDistance = distance / EARTH_RADIUS_KM;
  const startLatitude = radians(start.latitude);
  const startLongitude = radians(start.longitude);
  const endLatitude = Math.asin(
    Math.sin(startLatitude) * Math.cos(angularDistance)
    + Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const endLongitude = startLongitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLatitude),
    Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(endLatitude),
  );
  return Object.freeze({
    latitude: degrees(endLatitude),
    longitude: normalizeLongitude(degrees(endLongitude)),
  });
}

export function interpolateGreatCircle(first, second, fraction) {
  const from = normalizeCoordinates(first, 'Origin');
  const to = normalizeCoordinates(second, 'Destination');
  const progress = assertFiniteNumber(fraction, 'Fraction', { minimum: 0, maximum: 1 });
  const distance = haversineDistance(from, to);
  if (distance === 0) return from;
  return destinationPoint(from, distance * progress, initialBearing(from, to));
}

export function sampleRoute(points, options = {}) {
  const route = Array.isArray(points) ? points.map((point, index) => normalizeCoordinates(point, `Point ${index + 1}`)) : [];
  if (route.length < 2) return route;
  const spacingKm = Number.isFinite(options.spacingKm) ? Math.max(0.1, options.spacingKm) : 25;
  const samples = [route[0]];
  let carry = 0;
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const length = haversineDistance(start, end);
    let distance = spacingKm - carry;
    while (distance < length) {
      samples.push(interpolateGreatCircle(start, end, distance / length));
      distance += spacingKm;
    }
    carry = Math.max(0, length - (distance - spacingKm));
    if (carry >= spacingKm) carry %= spacingKm;
  }
  const last = route.at(-1);
  if (haversineDistance(samples.at(-1), last) > 0.001) samples.push(last);
  return samples;
}

export function routeDistance(points) {
  const route = Array.isArray(points) ? points : [];
  let distance = 0;
  for (let index = 1; index < route.length; index += 1) {
    distance += haversineDistance(route[index - 1], route[index]);
  }
  return distance;
}

export function boundsForLocations(locations, options = {}) {
  const coordinates = Array.isArray(locations)
    ? locations.map((location, index) => normalizeCoordinates(location, `Location ${index + 1}`))
    : [];
  if (!coordinates.length) return null;
  const padding = Number.isFinite(options.paddingDegrees) ? Math.max(0, options.paddingDegrees) : 0;
  const latitudes = coordinates.map((location) => location.latitude);
  const longitudes = coordinates.map((location) => location.longitude);
  return Object.freeze({
    south: Math.max(-90, Math.min(...latitudes) - padding),
    west: Math.max(-180, Math.min(...longitudes) - padding),
    north: Math.min(90, Math.max(...latitudes) + padding),
    east: Math.min(180, Math.max(...longitudes) + padding),
  });
}

export function containsCoordinate(bounds, location) {
  if (!bounds) return false;
  const point = normalizeCoordinates(location);
  const latitudeMatch = point.latitude >= bounds.south && point.latitude <= bounds.north;
  if (!latitudeMatch) return false;
  if (bounds.west <= bounds.east) {
    return point.longitude >= bounds.west && point.longitude <= bounds.east;
  }
  return point.longitude >= bounds.west || point.longitude <= bounds.east;
}

export function closestLocation(origin, locations) {
  const selected = Array.isArray(locations) ? locations : [];
  if (!selected.length) return null;
  return selected
    .map((location) => ({ location, distanceKm: haversineDistance(origin, location) }))
    .sort((first, second) => first.distanceKm - second.distanceKm)[0];
}

export function cardinalDirection(bearingDegrees, options = {}) {
  const bearing = ((assertFiniteNumber(bearingDegrees, 'Bearing') % 360) + 360) % 360;
  const labels = options.long
    ? ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
    : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(bearing / 45) % 8];
}

export function estimateTravelTimes(points, options = {}) {
  const speedKph = Number.isFinite(options.speedKph) ? Math.max(1, options.speedKph) : 80;
  const startsAt = Date.parse(options.startsAt ?? new Date().toISOString());
  const route = Array.isArray(points) ? points : [];
  let elapsedHours = 0;
  return route.map((point, index) => {
    if (index > 0) elapsedHours += haversineDistance(route[index - 1], point) / speedKph;
    return Object.freeze({
      ...normalizeCoordinates(point),
      distanceFromStartKm: index === 0 ? 0 : routeDistance(route.slice(0, index + 1)),
      estimatedAt: new Date(startsAt + elapsedHours * 3_600_000).toISOString(),
    });
  });
}

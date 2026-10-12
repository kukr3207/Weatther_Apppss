import { assertFiniteNumber, clamp, deepFreeze, parseTimestamp, round } from '../core/validation';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function julianDay(timestamp) {
  return timestamp / 86_400_000 + 2440587.5;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function solarCoordinates(timestamp) {
  const days = julianDay(timestamp) - 2451545;
  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * days);
  const meanAnomaly = normalizeDegrees(357.528 + 0.9856003 * days);
  const eclipticLongitude = normalizeDegrees(
    meanLongitude + 1.915 * Math.sin(meanAnomaly * DEG) + 0.02 * Math.sin(2 * meanAnomaly * DEG),
  );
  const obliquity = 23.439 - 0.0000004 * days;
  const rightAscension = Math.atan2(
    Math.cos(obliquity * DEG) * Math.sin(eclipticLongitude * DEG),
    Math.cos(eclipticLongitude * DEG),
  ) * RAD;
  const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(eclipticLongitude * DEG)) * RAD;
  return { rightAscension: normalizeDegrees(rightAscension), declination, eclipticLongitude };
}

function siderealTime(timestamp, longitude) {
  const jd = julianDay(timestamp);
  const centuries = (jd - 2451545) / 36525;
  const greenwich = 280.46061837 + 360.98564736629 * (jd - 2451545)
    + 0.000387933 * centuries ** 2 - centuries ** 3 / 38710000;
  return normalizeDegrees(greenwich + longitude);
}

export function solarPosition(at, location) {
  const timestamp = parseTimestamp(at);
  const latitude = assertFiniteNumber(location.latitude, 'Latitude', { minimum: -90, maximum: 90 });
  const longitude = assertFiniteNumber(location.longitude, 'Longitude', { minimum: -180, maximum: 180 });
  const solar = solarCoordinates(timestamp);
  const hourAngle = normalizeDegrees(siderealTime(timestamp, longitude) - solar.rightAscension);
  const signedHourAngle = hourAngle > 180 ? hourAngle - 360 : hourAngle;
  const elevation = Math.asin(
    Math.sin(latitude * DEG) * Math.sin(solar.declination * DEG)
    + Math.cos(latitude * DEG) * Math.cos(solar.declination * DEG) * Math.cos(signedHourAngle * DEG),
  ) * RAD;
  const azimuth = normalizeDegrees(Math.atan2(
    -Math.sin(signedHourAngle * DEG),
    Math.tan(solar.declination * DEG) * Math.cos(latitude * DEG)
      - Math.sin(latitude * DEG) * Math.cos(signedHourAngle * DEG),
  ) * RAD);
  return deepFreeze({
    at: new Date(timestamp).toISOString(),
    elevationDegrees: round(elevation, 3),
    azimuthDegrees: round(azimuth, 3),
    daylight: elevation > -0.833,
    civilTwilight: elevation > -6,
    nauticalTwilight: elevation > -12,
    astronomicalTwilight: elevation > -18,
  });
}

function findCrossing(date, location, threshold, rising) {
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  let previous = solarPosition(start, location).elevationDegrees - threshold;
  for (let minutes = 5; minutes <= 1440; minutes += 5) {
    const timestamp = start + minutes * 60_000;
    const current = solarPosition(timestamp, location).elevationDegrees - threshold;
    if ((rising && previous < 0 && current >= 0) || (!rising && previous >= 0 && current < 0)) {
      const fraction = Math.abs(previous) / (Math.abs(previous) + Math.abs(current));
      return new Date(timestamp - 5 * 60_000 + fraction * 5 * 60_000).toISOString();
    }
    previous = current;
  }
  return null;
}

export function solarEvents(dateInput, location) {
  const date = new Date(parseTimestamp(dateInput));
  const sunrise = findCrossing(date, location, -0.833, true);
  const sunset = findCrossing(date, location, -0.833, false);
  const civilDawn = findCrossing(date, location, -6, true);
  const civilDusk = findCrossing(date, location, -6, false);
  const nauticalDawn = findCrossing(date, location, -12, true);
  const nauticalDusk = findCrossing(date, location, -12, false);
  const astronomicalDawn = findCrossing(date, location, -18, true);
  const astronomicalDusk = findCrossing(date, location, -18, false);
  const daylightMinutes = sunrise && sunset ? Math.max(0, parseTimestamp(sunset) - parseTimestamp(sunrise)) / 60_000 : null;
  return deepFreeze({
    date: date.toISOString().slice(0, 10),
    sunrise,
    sunset,
    solarNoon: sunrise && sunset ? new Date((parseTimestamp(sunrise) + parseTimestamp(sunset)) / 2).toISOString() : null,
    civilDawn,
    civilDusk,
    nauticalDawn,
    nauticalDusk,
    astronomicalDawn,
    astronomicalDusk,
    goldenHourMorningEnds: sunrise ? new Date(parseTimestamp(sunrise) + 60 * 60_000).toISOString() : null,
    goldenHourEveningStarts: sunset ? new Date(parseTimestamp(sunset) - 60 * 60_000).toISOString() : null,
    daylightMinutes: round(daylightMinutes, 1),
  });
}

export function moonPhase(at = new Date().toISOString()) {
  const timestamp = parseTimestamp(at);
  const knownNewMoon = Date.parse('2000-01-06T18:14:00Z');
  const synodicMonthDays = 29.530588853;
  const ageDays = ((timestamp - knownNewMoon) / 86_400_000 % synodicMonthDays + synodicMonthDays) % synodicMonthDays;
  const fraction = ageDays / synodicMonthDays;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const names = [
    [0.03, 'new_moon'],
    [0.22, 'waxing_crescent'],
    [0.28, 'first_quarter'],
    [0.47, 'waxing_gibbous'],
    [0.53, 'full_moon'],
    [0.72, 'waning_gibbous'],
    [0.78, 'last_quarter'],
    [0.97, 'waning_crescent'],
    [1, 'new_moon'],
  ];
  return deepFreeze({
    at: new Date(timestamp).toISOString(),
    ageDays: round(ageDays, 2),
    fraction: round(fraction, 4),
    illuminationPercent: round(illumination * 100, 1),
    phase: names.find(([maximum]) => fraction <= maximum)?.[1] ?? 'new_moon',
    waxing: fraction < 0.5,
  });
}

export function stargazingScore(period, location = {}) {
  const cloud = clamp(period.cloudPercent ?? 50, 0, 100);
  const visibility = Math.max(0, period.visibilityMeters ?? 10_000);
  const humidity = clamp(period.humidityPercent ?? 50, 0, 100);
  const moon = moonPhase(period.forecastAt);
  const sun = solarPosition(period.forecastAt, location);
  let score = 100;
  score -= cloud * 0.7;
  score -= Math.max(0, 10_000 - visibility) / 10_000 * 20;
  score -= Math.max(0, humidity - 70) * 0.5;
  score -= moon.illuminationPercent * 0.15;
  if (sun.astronomicalTwilight) score -= 60;
  if ((period.precipitationProbability ?? 0) > 0.2) score -= 25;
  return deepFreeze({
    score: round(clamp(score, 0, 100), 1),
    rating: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
    moon,
    sun,
  });
}

import {
  assertArray,
  assertFiniteNumber,
  deepFreeze,
  normalizeCoordinates,
  parseTimestamp,
  round,
} from '../core/validation';
import { destinationPoint, haversineDistance, initialBearing } from '../core/geo';
import { maximum, mean, minimum } from '../core/statistics';

const WIND_CLASSES = Object.freeze([
  { minimumMps: 70, code: 'category_5', label: 'Category 5' },
  { minimumMps: 58, code: 'category_4', label: 'Category 4' },
  { minimumMps: 50, code: 'category_3', label: 'Category 3' },
  { minimumMps: 43, code: 'category_2', label: 'Category 2' },
  { minimumMps: 33, code: 'category_1', label: 'Category 1' },
  { minimumMps: 17, code: 'tropical_storm', label: 'Tropical storm' },
  { minimumMps: 0, code: 'depression', label: 'Tropical depression' },
]);

function classifyWind(windSpeedMps) {
  return WIND_CLASSES.find((entry) => windSpeedMps >= entry.minimumMps) ?? WIND_CLASSES.at(-1);
}

function normalizeAdvisory(advisory, index) {
  const coordinates = normalizeCoordinates(advisory, `Cyclone advisory ${index + 1}`);
  const issuedAt = new Date(parseTimestamp(advisory.issuedAt ?? advisory.observedAt, `Cyclone advisory ${index + 1} time`)).toISOString();
  const maximumWindMps = assertFiniteNumber(advisory.maximumWindMps ?? advisory.windSpeedMps, 'Maximum wind speed', { minimum: 0 });
  const classification = classifyWind(maximumWindMps);
  return deepFreeze({
    id: String(advisory.id ?? `advisory-${issuedAt}`),
    issuedAt,
    ...coordinates,
    centralPressureHpa: Number.isFinite(advisory.centralPressureHpa) ? advisory.centralPressureHpa : null,
    maximumWindMps,
    gustMps: Number.isFinite(advisory.gustMps) ? advisory.gustMps : null,
    radius34KtKm: Number.isFinite(advisory.radius34KtKm) ? advisory.radius34KtKm : null,
    radius50KtKm: Number.isFinite(advisory.radius50KtKm) ? advisory.radius50KtKm : null,
    radius64KtKm: Number.isFinite(advisory.radius64KtKm) ? advisory.radius64KtKm : null,
    classification: classification.code,
    classificationLabel: classification.label,
    source: advisory.source ?? null,
  });
}

export function analyzeCycloneTrack(inputAdvisories) {
  const advisories = assertArray(inputAdvisories, 'Cyclone advisories', { nonEmpty: true }).map(normalizeAdvisory)
    .sort((first, second) => parseTimestamp(first.issuedAt) - parseTimestamp(second.issuedAt));
  const segments = [];
  for (let index = 1; index < advisories.length; index += 1) {
    const previous = advisories[index - 1];
    const current = advisories[index];
    const durationHours = (parseTimestamp(current.issuedAt) - parseTimestamp(previous.issuedAt)) / 3_600_000;
    if (durationHours <= 0) throw new TypeError('Cyclone advisories must have distinct chronological times.');
    const distanceKm = haversineDistance(previous, current);
    segments.push(deepFreeze({
      startsAt: previous.issuedAt,
      endsAt: current.issuedAt,
      distanceKm: round(distanceKm, 1),
      durationHours: round(durationHours, 2),
      speedKph: round(distanceKm / durationHours, 1),
      bearingDegrees: round(initialBearing(previous, current), 1),
      intensityChangeMps: round(current.maximumWindMps - previous.maximumWindMps, 1),
      pressureChangeHpa: Number.isFinite(previous.centralPressureHpa) && Number.isFinite(current.centralPressureHpa)
        ? round(current.centralPressureHpa - previous.centralPressureHpa, 1)
        : null,
    }));
  }
  return deepFreeze({
    advisories,
    segments,
    latest: advisories.at(-1),
    totalDistanceKm: round(segments.reduce((total, segment) => total + segment.distanceKm, 0), 1),
    averageSpeedKph: round(mean(segments.map((segment) => segment.speedKph)), 1),
    peakWindMps: maximum(advisories.map((advisory) => advisory.maximumWindMps)),
    minimumPressureHpa: minimum(advisories.map((advisory) => advisory.centralPressureHpa).filter(Number.isFinite)),
    strengthening: segments.at(-1)?.intensityChangeMps > 0,
  });
}

export function projectCycloneTrack(track, options = {}) {
  const analysis = track.segments ? track : analyzeCycloneTrack(track);
  const latest = analysis.latest;
  const recent = analysis.segments.slice(-(options.segmentCount ?? 3));
  const speedKph = options.speedKph ?? mean(recent.map((segment) => segment.speedKph)) ?? 0;
  const bearing = options.bearingDegrees ?? circularBearing(recent.map((segment) => segment.bearingDegrees));
  const hours = assertArray(options.hours ?? [6, 12, 24, 36, 48], 'Projection hours', { nonEmpty: true });
  const uncertaintyPerHourKm = assertFiniteNumber(options.uncertaintyPerHourKm ?? 4, 'Track uncertainty rate', { minimum: 0 });
  return hours.map((hour) => {
    const duration = assertFiniteNumber(hour, 'Projection hour', { minimum: 0 });
    const center = destinationPoint(latest, speedKph * duration, bearing);
    return deepFreeze({
      validAt: new Date(parseTimestamp(latest.issuedAt) + duration * 3_600_000).toISOString(),
      forecastHour: duration,
      ...center,
      speedKph: round(speedKph, 1),
      bearingDegrees: round(bearing, 1),
      uncertaintyRadiusKm: round((options.initialUncertaintyKm ?? 25) + duration * uncertaintyPerHourKm, 1),
      maximumWindMps: round(Math.max(0, latest.maximumWindMps + (options.intensityChangeMpsPerHour ?? 0) * duration), 1),
    });
  });
}

function circularBearing(values) {
  if (!values.length) return 0;
  const x = values.reduce((total, value) => total + Math.cos(value * Math.PI / 180), 0);
  const y = values.reduce((total, value) => total + Math.sin(value * Math.PI / 180), 0);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

export function assessCycloneLocationRisk(location, cyclone, options = {}) {
  const target = normalizeCoordinates(location);
  const analysis = cyclone.segments ? cyclone : analyzeCycloneTrack(cyclone);
  const points = [analysis.latest, ...(options.projection ?? projectCycloneTrack(analysis, options))];
  const approaches = points.map((point) => {
    const distanceKm = haversineDistance(target, point);
    const windRadiusKm = point.radius34KtKm ?? analysis.latest.radius34KtKm ?? options.defaultWindRadiusKm ?? 150;
    const uncertaintyRadiusKm = point.uncertaintyRadiusKm ?? 0;
    return {
      validAt: point.validAt ?? point.issuedAt,
      distanceKm,
      windRadiusKm,
      uncertaintyRadiusKm,
      insideWindField: distanceKm <= windRadiusKm,
      insideUncertainty: distanceKm <= uncertaintyRadiusKm,
      maximumWindMps: point.maximumWindMps,
    };
  });
  const closest = approaches.sort((first, second) => first.distanceKm - second.distanceKm)[0];
  const proximity = Math.max(0, 100 - closest.distanceKm / Math.max(1, closest.windRadiusKm + closest.uncertaintyRadiusKm) * 60);
  const intensity = Math.min(100, analysis.latest.maximumWindMps / 70 * 100);
  const score = Math.max(0, Math.min(100, proximity * 0.65 + intensity * 0.35));
  const level = score >= 80 ? 'extreme' : score >= 60 ? 'high' : score >= 35 ? 'moderate' : score >= 15 ? 'low' : 'minimal';
  const actions = [];
  if (level === 'extreme' || level === 'high') actions.push('Review evacuation zones and follow official emergency instructions.');
  if (closest.insideWindField) actions.push('Secure loose outdoor items and prepare for power interruption.');
  if (closest.distanceKm < (options.coastalFloodDistanceKm ?? 100)) actions.push('Monitor storm-surge and coastal-flood guidance.');
  return deepFreeze({
    location: target,
    level,
    score: round(score, 1),
    closestApproach: { ...closest, distanceKm: round(closest.distanceKm, 1) },
    actions,
  });
}

export function cycloneImpactWindows(location, projection, options = {}) {
  const target = normalizeCoordinates(location);
  const thresholdKm = options.thresholdKm ?? 250;
  const selected = projection.filter((point) => haversineDistance(target, point) <= thresholdKm);
  if (!selected.length) return deepFreeze({ affected: false, startsAt: null, endsAt: null, closest: null });
  const closest = [...selected].sort((first, second) => haversineDistance(target, first) - haversineDistance(target, second))[0];
  return deepFreeze({
    affected: true,
    startsAt: selected[0].validAt,
    endsAt: selected.at(-1).validAt,
    closest: {
      validAt: closest.validAt,
      distanceKm: round(haversineDistance(target, closest), 1),
      maximumWindMps: closest.maximumWindMps,
    },
  });
}

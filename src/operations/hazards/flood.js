import { assertArray, assertFiniteNumber, deepFreeze, parseTimestamp, round } from '../core/validation';
import { linearRegression, maximum, mean, sum } from '../core/statistics';

function normalizeGauge(reading, index) {
  return deepFreeze({
    observedAt: new Date(parseTimestamp(reading.observedAt ?? reading.timestamp, `Gauge reading ${index + 1} time`)).toISOString(),
    levelM: assertFiniteNumber(reading.levelM, `Gauge reading ${index + 1} level`),
    flowCms: Number.isFinite(reading.flowCms) ? reading.flowCms : null,
    quality: reading.quality ?? 'observed',
  });
}

export function analyzeRiverGauge(inputReadings, thresholds, options = {}) {
  const readings = assertArray(inputReadings, 'River gauge readings', { nonEmpty: true }).map(normalizeGauge)
    .sort((first, second) => parseTimestamp(first.observedAt) - parseTimestamp(second.observedAt));
  const latest = readings.at(-1);
  const points = readings.map((reading) => ({
    x: (parseTimestamp(reading.observedAt) - parseTimestamp(readings[0].observedAt)) / 3_600_000,
    y: reading.levelM,
  }));
  const trend = linearRegression(points);
  const stages = [
    ['major', thresholds.majorM],
    ['moderate', thresholds.moderateM],
    ['minor', thresholds.minorM],
    ['action', thresholds.actionM],
  ].filter(([, value]) => Number.isFinite(value)).sort((first, second) => second[1] - first[1]);
  const stage = stages.find(([, value]) => latest.levelM >= value)?.[0] ?? 'normal';
  const next = [...stages].reverse().find(([, value]) => value > latest.levelM);
  const hoursToNextStage = next && trend.slope > 0 ? (next[1] - latest.levelM) / trend.slope : null;
  return deepFreeze({
    latest,
    stage,
    trendMPerHour: round(trend.slope, 3),
    trend: Math.abs(trend.slope ?? 0) < (options.steadyTolerance ?? 0.01) ? 'steady' : trend.slope > 0 ? 'rising' : 'falling',
    nextStage: next?.[0] ?? null,
    hoursToNextStage: round(hoursToNextStage, 1),
    peakLevelM: maximum(readings.map((reading) => reading.levelM)),
    averageFlowCms: round(mean(readings.map((reading) => reading.flowCms).filter(Number.isFinite)), 1),
    readings,
  });
}

export function assessFlashFloodRisk(input, options = {}) {
  const rain1h = Math.max(0, input.rain1hMm ?? 0);
  const rain3h = Math.max(0, input.rain3hMm ?? rain1h);
  const rain24h = Math.max(0, input.rain24hMm ?? rain3h);
  const soilSaturation = Math.max(0, Math.min(1, input.soilSaturation ?? 0.5));
  const slopePercent = Math.max(0, input.slopePercent ?? 0);
  const imperviousPercent = Math.max(0, Math.min(100, input.imperviousPercent ?? 0));
  const burnScar = input.burnScar === true;
  let score = Math.min(40, rain1h * 1.5)
    + Math.min(20, rain3h * 0.35)
    + Math.min(10, rain24h * 0.08)
    + soilSaturation * 15
    + Math.min(8, slopePercent * 0.4)
    + imperviousPercent * 0.07
    + (burnScar ? 15 : 0);
  score = Math.max(0, Math.min(100, score));
  const level = score >= 80 ? 'extreme' : score >= 60 ? 'high' : score >= 35 ? 'moderate' : score >= 15 ? 'low' : 'minimal';
  const actions = [];
  if (level === 'extreme' || level === 'high') actions.push('Move away from streams, underpasses, and low-water crossings.');
  if (imperviousPercent >= 60) actions.push('Expect rapid street flooding in poorly drained areas.');
  if (burnScar) actions.push('Avoid drainage channels below recent burn scars.');
  return deepFreeze({
    score: round(score, 1),
    level,
    inputs: { rain1hMm: rain1h, rain3hMm: rain3h, rain24hMm: rain24h, soilSaturation, slopePercent, imperviousPercent, burnScar },
    actions,
  });
}

export function calculateCatchmentResponse(inputPeriods, catchment, options = {}) {
  const areaKm2 = assertFiniteNumber(catchment.areaKm2, 'Catchment area', { minimum: 0.01 });
  const runoffCoefficient = assertFiniteNumber(catchment.runoffCoefficient ?? 0.4, 'Runoff coefficient', { minimum: 0, maximum: 1 });
  const lagHours = assertFiniteNumber(catchment.lagHours ?? 2, 'Catchment lag', { minimum: 0 });
  const baseFlowCms = assertFiniteNumber(catchment.baseFlowCms ?? 0, 'Base flow', { minimum: 0 });
  const periods = assertArray(inputPeriods, 'Rainfall periods', { nonEmpty: true }).map((period, index) => ({
    startsAt: new Date(parseTimestamp(period.startsAt ?? period.forecastAt, `Rainfall period ${index + 1} time`)).toISOString(),
    durationHours: assertFiniteNumber(period.durationHours ?? 1, `Rainfall period ${index + 1} duration`, { minimum: 0.01 }),
    rainfallMm: assertFiniteNumber(period.rainfallMm ?? period.precipitationMm ?? 0, `Rainfall period ${index + 1} amount`, { minimum: 0 }),
  }));
  const hydrograph = periods.map((period) => {
    const volumeM3 = period.rainfallMm / 1000 * areaKm2 * 1_000_000 * runoffCoefficient;
    const additionalFlowCms = volumeM3 / (period.durationHours * 3600);
    return deepFreeze({
      validAt: new Date(parseTimestamp(period.startsAt) + lagHours * 3_600_000).toISOString(),
      rainfallMm: period.rainfallMm,
      runoffVolumeM3: round(volumeM3, 0),
      flowCms: round(baseFlowCms + additionalFlowCms, 2),
    });
  });
  return deepFreeze({
    catchment: { ...catchment, areaKm2, runoffCoefficient, lagHours, baseFlowCms },
    hydrograph,
    peakFlowCms: maximum(hydrograph.map((entry) => entry.flowCms)),
    totalRainfallMm: round(sum(periods.map((period) => period.rainfallMm)), 1),
    totalRunoffM3: round(sum(hydrograph.map((entry) => entry.runoffVolumeM3)), 0),
  });
}

export function floodTravelAdvisory(routeSegments, hazards, options = {}) {
  const affected = [];
  assertArray(routeSegments, 'Route segments').forEach((segment, index) => {
    const matches = hazards.filter((hazard) => {
      if (hazard.segmentIds?.includes(segment.id)) return true;
      if (segment.elevationM !== undefined && hazard.maximumSafeElevationM !== undefined) {
        return segment.elevationM <= hazard.maximumSafeElevationM;
      }
      return false;
    });
    if (!matches.length) return;
    affected.push({
      segmentId: segment.id ?? `segment-${index + 1}`,
      road: segment.road ?? null,
      hazards: matches.map((hazard) => hazard.id ?? hazard.type ?? 'flood'),
      maximumDepthM: maximum(matches.map((hazard) => hazard.depthM).filter(Number.isFinite)),
      closed: matches.some((hazard) => hazard.closed === true || (hazard.depthM ?? 0) >= (options.closureDepthM ?? 0.3)),
    });
  });
  return deepFreeze({
    safe: affected.length === 0,
    affected,
    closedSegments: affected.filter((segment) => segment.closed).map((segment) => segment.segmentId),
    instruction: affected.length
      ? 'Do not enter flooded roads. Use a verified alternate route.'
      : 'No mapped flood hazards intersect the route.',
  });
}

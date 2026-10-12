import { assertArray, assertFiniteNumber, clamp, deepFreeze, round } from '../core/validation';
import { maximum, mean, minimum } from '../core/statistics';

const BEAUFORT = Object.freeze([
  { force: 0, maximum: 0.2, label: 'Calm', sea: 'Mirror-like sea' },
  { force: 1, maximum: 1.5, label: 'Light air', sea: 'Small ripples' },
  { force: 2, maximum: 3.3, label: 'Light breeze', sea: 'Small wavelets' },
  { force: 3, maximum: 5.4, label: 'Gentle breeze', sea: 'Large wavelets' },
  { force: 4, maximum: 7.9, label: 'Moderate breeze', sea: 'Small waves' },
  { force: 5, maximum: 10.7, label: 'Fresh breeze', sea: 'Moderate waves' },
  { force: 6, maximum: 13.8, label: 'Strong breeze', sea: 'Large waves' },
  { force: 7, maximum: 17.1, label: 'Near gale', sea: 'Sea heaps up' },
  { force: 8, maximum: 20.7, label: 'Gale', sea: 'Moderately high waves' },
  { force: 9, maximum: 24.4, label: 'Strong gale', sea: 'High waves' },
  { force: 10, maximum: 28.4, label: 'Storm', sea: 'Very high waves' },
  { force: 11, maximum: 32.6, label: 'Violent storm', sea: 'Exceptionally high waves' },
  { force: 12, maximum: Infinity, label: 'Hurricane force', sea: 'Air filled with spray' },
]);

export function beaufortScale(windSpeedMps) {
  const speed = assertFiniteNumber(windSpeedMps, 'Wind speed', { minimum: 0 });
  const selected = BEAUFORT.find((entry) => speed <= entry.maximum) ?? BEAUFORT.at(-1);
  return deepFreeze({ ...selected, windSpeedMps: speed });
}

export function waveRisk(period, vessel = {}) {
  const waveHeight = Math.max(0, period.waveHeightMeters ?? 0);
  const wavePeriod = Math.max(0.1, period.wavePeriodSeconds ?? 6);
  const wind = Math.max(0, period.windSpeedMps ?? 0);
  const gust = Math.max(wind, period.windGustMps ?? wind);
  const vesselLength = assertFiniteNumber(vessel.lengthMeters ?? 8, 'Vessel length', { minimum: 1 });
  const maximumWave = Number.isFinite(vessel.maximumWaveHeightMeters)
    ? vessel.maximumWaveHeightMeters
    : vesselLength * 0.18;
  const steepness = waveHeight / Math.max(0.1, 1.56 * wavePeriod ** 2);
  let score = 0;
  score += clamp(waveHeight / maximumWave * 45, 0, 55);
  score += clamp(wind / 20 * 25, 0, 30);
  score += clamp(gust / 30 * 15, 0, 20);
  if (steepness >= 0.05) score += 20;
  if ((period.visibilityMeters ?? 10_000) < 1000) score += 20;
  if (period.thunderstorm) score = Math.max(score, 90);
  score = clamp(score, 0, 100);
  const reasons = [];
  if (waveHeight > maximumWave) reasons.push('Wave height exceeds the vessel guideline.');
  if (wind >= 12) reasons.push('Strong wind will make handling more difficult.');
  if (steepness >= 0.05) reasons.push('Short, steep waves may produce uncomfortable motion.');
  if ((period.visibilityMeters ?? 10_000) < 1000) reasons.push('Visibility is poor.');
  if (period.thunderstorm) reasons.push('Thunderstorms make this period unsafe.');
  return deepFreeze({
    score: round(score, 1),
    level: score >= 85 ? 'dangerous' : score >= 65 ? 'poor' : score >= 40 ? 'caution' : 'favorable',
    waveHeightMeters: waveHeight,
    wavePeriodSeconds: wavePeriod,
    waveSteepness: round(steepness, 4),
    beaufort: beaufortScale(wind),
    reasons,
  });
}

export function rankMarineWindows(periods, vessel = {}) {
  const selected = assertArray(periods, 'Marine forecast periods', { nonEmpty: true });
  return selected.map((period) => ({
    forecastAt: period.forecastAt,
    assessment: waveRisk(period, vessel),
    period,
  })).sort((first, second) => first.assessment.score - second.assessment.score
    || String(first.forecastAt).localeCompare(String(second.forecastAt)));
}

export function calculateTideWindows(predictions, options = {}) {
  const selected = assertArray(predictions, 'Tide predictions', { nonEmpty: true })
    .filter((prediction) => Number.isFinite(prediction.heightMeters))
    .sort((first, second) => Date.parse(first.at) - Date.parse(second.at));
  const minimumHeight = Number.isFinite(options.minimumHeightMeters) ? options.minimumHeightMeters : -Infinity;
  const maximumHeight = Number.isFinite(options.maximumHeightMeters) ? options.maximumHeightMeters : Infinity;
  const windows = [];
  let current = [];
  selected.forEach((prediction) => {
    const suitable = prediction.heightMeters >= minimumHeight && prediction.heightMeters <= maximumHeight;
    if (suitable) current.push(prediction);
    else if (current.length) {
      windows.push(current);
      current = [];
    }
  });
  if (current.length) windows.push(current);
  return windows.map((window) => deepFreeze({
    startsAt: window[0].at,
    endsAt: window.at(-1).at,
    minimumHeightMeters: minimum(window.map((item) => item.heightMeters)),
    maximumHeightMeters: maximum(window.map((item) => item.heightMeters)),
    averageHeightMeters: round(mean(window.map((item) => item.heightMeters)), 2),
  }));
}

export function coastalFloodRisk(period, context = {}) {
  const tide = period.tideHeightMeters ?? 0;
  const surge = period.surgeMeters ?? 0;
  const wave = period.waveHeightMeters ?? 0;
  const threshold = assertFiniteNumber(context.floodThresholdMeters ?? 2.5, 'Flood threshold');
  const waveContribution = wave * assertFiniteNumber(context.waveRunupFactor ?? 0.35, 'Wave run-up factor', { minimum: 0 });
  const total = tide + surge + waveContribution;
  const margin = total - threshold;
  const score = clamp(50 + margin / Math.max(0.1, threshold) * 100, 0, 100);
  return deepFreeze({
    score: round(score, 1),
    level: score >= 85 ? 'extreme' : score >= 65 ? 'high' : score >= 40 ? 'moderate' : 'low',
    estimatedWaterLevelMeters: round(total, 2),
    thresholdMeters: threshold,
    marginMeters: round(margin, 2),
  });
}

export function summarizeMarineForecast(periods, vessel = {}, context = {}) {
  const ranked = rankMarineWindows(periods, vessel);
  const flood = periods.map((period) => coastalFloodRisk(period, context));
  return deepFreeze({
    ranked,
    bestAt: ranked[0]?.forecastAt ?? null,
    worstAt: ranked.at(-1)?.forecastAt ?? null,
    minimumVesselRisk: ranked[0]?.assessment.score ?? null,
    maximumVesselRisk: maximum(ranked.map((entry) => entry.assessment.score)),
    maximumFloodRisk: maximum(flood.map((entry) => entry.score)),
  });
}

export const BEAUFORT_SCALE = BEAUFORT;

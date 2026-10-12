import { assertArray, assertFiniteNumber, assertObject, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, sum } from '../core/statistics';

const MODE_POLICIES = Object.freeze({
  walking: { rain: 1, wind: 1, heat: 1, cold: 1, visibility: 0.5 },
  cycling: { rain: 1.2, wind: 1.4, heat: 0.9, cold: 0.8, visibility: 1 },
  motorcycle: { rain: 1.5, wind: 1.3, heat: 0.5, cold: 0.7, visibility: 1.2 },
  driving: { rain: 0.7, wind: 0.5, heat: 0.2, cold: 0.3, visibility: 1 },
  transit: { rain: 0.35, wind: 0.3, heat: 0.3, cold: 0.3, visibility: 0.2 },
});

function normalizeLeg(leg, index) {
  assertObject(leg, `Commute leg ${index + 1}`);
  const mode = MODE_POLICIES[leg.mode] ? leg.mode : 'walking';
  const startsAt = new Date(parseTimestamp(leg.startsAt, `Commute leg ${index + 1} start`)).toISOString();
  const durationMinutes = assertFiniteNumber(leg.durationMinutes, `Commute leg ${index + 1} duration`, { minimum: 0.1 });
  return deepFreeze({
    id: String(leg.id ?? `leg-${index + 1}`),
    mode,
    startsAt,
    endsAt: new Date(parseTimestamp(startsAt) + durationMinutes * 60_000).toISOString(),
    durationMinutes,
    distanceKm: Number.isFinite(leg.distanceKm) ? leg.distanceKm : null,
    weather: deepFreeze({ ...(leg.weather ?? {}) }),
    exposed: leg.exposed !== false,
  });
}

function legRisk(leg) {
  const policy = MODE_POLICIES[leg.mode];
  const weather = leg.weather;
  const rain = Math.min(100, (weather.precipitationMm ?? 0) * 12 + (weather.precipitationProbability ?? 0) * 35);
  const wind = Math.min(100, Math.max(0, (weather.windSpeedMps ?? 0) - 5) * 8);
  const heat = Math.min(100, Math.max(0, (weather.feelsLikeC ?? weather.temperatureC ?? 25) - 30) * 8);
  const cold = Math.min(100, Math.max(0, 10 - (weather.feelsLikeC ?? weather.temperatureC ?? 25)) * 8);
  const visibility = Math.min(100, Math.max(0, 5000 - (weather.visibilityMeters ?? 10000)) / 50);
  const lightning = weather.lightningRisk === 'high' || weather.lightningRisk === 'extreme' ? 100
    : weather.lightningRisk === 'moderate' ? 60 : 0;
  const flood = weather.floodRisk === 'high' || weather.floodRisk === 'extreme' ? 100
    : weather.floodRisk === 'moderate' ? 60 : 0;
  const exposureFactor = leg.exposed ? 1 : 0.45;
  const weighted = (rain * policy.rain + wind * policy.wind + heat * policy.heat
    + cold * policy.cold + visibility * policy.visibility + lightning * 1.5 + flood * 1.5)
    / (policy.rain + policy.wind + policy.heat + policy.cold + policy.visibility + 3);
  const hazardFloor = Math.max(
    lightning >= 100 && leg.exposed ? 70 : lightning >= 60 && leg.exposed ? 45 : 0,
    flood >= 100 ? 75 : flood >= 60 ? 50 : 0,
  );
  return deepFreeze({
    score: round(Math.min(100, Math.max(weighted * exposureFactor, hazardFloor)), 1),
    components: { rain: round(rain, 1), wind: round(wind, 1), heat: round(heat, 1), cold: round(cold, 1), visibility: round(visibility, 1), lightning, flood },
  });
}

export function assessCommute(inputLegs, options = {}) {
  const legs = assertArray(inputLegs, 'Commute legs', { nonEmpty: true }).map(normalizeLeg)
    .sort((first, second) => parseTimestamp(first.startsAt) - parseTimestamp(second.startsAt));
  const assessed = legs.map((leg) => deepFreeze({ ...leg, risk: legRisk(leg) }));
  const duration = sum(assessed.map((leg) => leg.durationMinutes));
  const weightedRisk = duration
    ? sum(assessed.map((leg) => leg.risk.score * leg.durationMinutes)) / duration
    : 0;
  const peakRisk = maximum(assessed.map((leg) => leg.risk.score)) ?? 0;
  const score = Math.max(weightedRisk, peakRisk * (options.peakRiskWeight ?? 0.75));
  const level = score >= 75 ? 'avoid' : score >= 55 ? 'poor' : score >= 35 ? 'caution' : score >= 15 ? 'fair' : 'good';
  const recommendations = [];
  if (assessed.some((leg) => leg.risk.components.lightning >= 100 && leg.exposed)) recommendations.push('Delay exposed travel until 30 minutes after the last nearby lightning.');
  if (assessed.some((leg) => leg.risk.components.flood >= 100)) recommendations.push('Use a route that avoids flooded roads and underpasses.');
  if (assessed.some((leg) => leg.risk.components.rain >= 50)) recommendations.push('Allow extra time and carry rain protection.');
  if (assessed.some((leg) => leg.risk.components.heat >= 50)) recommendations.push('Carry water and reduce strenuous outdoor segments.');
  return deepFreeze({
    level,
    score: round(score, 1),
    totalDurationMinutes: round(duration, 1),
    startsAt: assessed[0].startsAt,
    endsAt: assessed.at(-1).endsAt,
    legs: assessed,
    recommendations,
  });
}

export function compareCommutes(inputCommutes) {
  const assessments = assertArray(inputCommutes, 'Commute options', { nonEmpty: true }).map((option, index) => {
    const assessment = option.assessment ?? assessCommute(option.legs, option.options);
    return { id: String(option.id ?? `option-${index + 1}`), name: option.name ?? `Option ${index + 1}`, assessment };
  }).sort((first, second) => (
    first.assessment.score - second.assessment.score
    || first.assessment.totalDurationMinutes - second.assessment.totalDurationMinutes
  ));
  return assessments.map((option, index) => deepFreeze({ ...option, rank: index + 1, recommended: index === 0 }));
}

export function findCommuteDepartureWindow(inputWindows, options = {}) {
  const evaluated = assertArray(inputWindows, 'Departure windows', { nonEmpty: true }).map((window, index) => {
    const assessment = assessCommute(window.legs, options);
    return deepFreeze({
      id: String(window.id ?? `window-${index + 1}`),
      departsAt: new Date(parseTimestamp(window.departsAt ?? window.legs[0].startsAt)).toISOString(),
      assessment,
    });
  }).sort((first, second) => assessmentUtility(first.assessment, options) - assessmentUtility(second.assessment, options));
  return deepFreeze({
    recommended: evaluated[0],
    windows: evaluated,
    averageScore: round(mean(evaluated.map((window) => window.assessment.score)), 1),
  });
}

function assessmentUtility(assessment, options) {
  return assessment.score * (options.riskWeight ?? 1) + assessment.totalDurationMinutes * (options.durationWeight ?? 0.1);
}

export function commuteNotification(assessment) {
  const title = assessment.level === 'avoid' ? 'Avoid this commute if possible'
    : assessment.level === 'poor' ? 'Weather may disrupt your commute'
      : assessment.level === 'caution' ? 'Use caution during your commute'
        : 'Commute conditions look manageable';
  return deepFreeze({
    title,
    message: assessment.recommendations[0] ?? `Expected commute risk is ${assessment.level}.`,
    severity: assessment.level === 'avoid' ? 'critical' : assessment.level === 'poor' ? 'warning' : 'information',
    data: { score: assessment.score, startsAt: assessment.startsAt, endsAt: assessment.endsAt },
  });
}

import { assertArray, clamp, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, sum } from '../core/statistics';

function lightningRisk(period) {
  const conditionCode = Number(period.condition?.id ?? period.conditionCode);
  const thunder = conditionCode >= 200 && conditionCode < 300;
  const cape = Math.max(0, period.capeJkg ?? 0);
  const liftedIndex = period.liftedIndex ?? 0;
  const precipitation = period.precipitationProbability ?? 0;
  let score = thunder ? 75 : 0;
  score += Math.min(30, cape / 100);
  if (liftedIndex <= -4) score += 20;
  else if (liftedIndex <= -2) score += 10;
  score += precipitation * 10;
  return clamp(score, 0, 100);
}

function hailRisk(period) {
  const cape = Math.max(0, period.capeJkg ?? 0);
  const shear = Math.max(0, period.windShearMps ?? 0);
  const freezingLevel = period.freezingLevelMeters ?? 3000;
  let score = Math.min(40, cape / 75) + Math.min(35, shear * 1.5);
  if (freezingLevel < 2500) score += 15;
  if (lightningRisk(period) >= 60) score += 10;
  return clamp(score, 0, 100);
}

function tornadoRisk(period) {
  const cape = Math.max(0, period.capeJkg ?? 0);
  const helicity = Math.max(0, period.stormRelativeHelicity ?? 0);
  const shear = Math.max(0, period.windShearMps ?? 0);
  const dewPoint = period.dewPointC ?? 0;
  let score = Math.min(30, cape / 100) + Math.min(35, helicity / 10) + Math.min(25, shear);
  if (dewPoint >= 18) score += 10;
  if (lightningRisk(period) < 40) score *= 0.4;
  return clamp(score, 0, 100);
}

function damagingWindRisk(period) {
  const gust = period.windGustMps ?? period.windSpeedMps ?? 0;
  const downdraft = period.downdraftCapeJkg ?? 0;
  return clamp(gust / 35 * 70 + downdraft / 1500 * 30, 0, 100);
}

function floodRisk(period) {
  const rain = period.rainMm ?? period.precipitationMm ?? 0;
  const rate = period.precipitationRateMmPerHour ?? rain;
  const antecedent = period.antecedentRainMm ?? 0;
  const urban = period.urbanFraction ?? 0;
  return clamp(rain / 50 * 45 + rate / 30 * 35 + antecedent / 100 * 15 + urban * 10, 0, 100);
}

export function assessSevereWeatherPeriod(period) {
  const risks = {
    lightning: round(lightningRisk(period), 1),
    hail: round(hailRisk(period), 1),
    tornado: round(tornadoRisk(period), 1),
    damagingWind: round(damagingWindRisk(period), 1),
    flashFlood: round(floodRisk(period), 1),
  };
  const overall = maximum(Object.values(risks)) ?? 0;
  const hazards = Object.entries(risks).filter(([, score]) => score >= 40)
    .sort(([, first], [, second]) => second - first)
    .map(([type, score]) => ({ type, score }));
  const actions = [];
  if (risks.lightning >= 40) actions.push('Move indoors when thunder is heard.');
  if (risks.hail >= 60) actions.push('Protect vehicles and avoid exposed windows.');
  if (risks.tornado >= 60) actions.push('Identify the nearest sturdy shelter.');
  if (risks.damagingWind >= 60) actions.push('Secure loose outdoor objects.');
  if (risks.flashFlood >= 60) actions.push('Avoid low-water crossings and flooded roads.');
  return deepFreeze({
    forecastAt: period.forecastAt,
    risks,
    overall: round(overall, 1),
    level: overall >= 85 ? 'extreme' : overall >= 65 ? 'severe' : overall >= 40 ? 'elevated' : 'low',
    hazards,
    actions,
  });
}

export function summarizeSevereWeather(periods) {
  const assessments = assertArray(periods, 'Forecast periods', { nonEmpty: true }).map(assessSevereWeatherPeriod);
  const highest = [...assessments].sort((first, second) => second.overall - first.overall)[0];
  const riskHours = assessments.filter((assessment) => assessment.overall >= 40);
  return deepFreeze({
    assessments,
    highest,
    maximumRisk: highest.overall,
    averageRisk: round(mean(assessments.map((assessment) => assessment.overall)), 1),
    elevatedPeriodCount: riskHours.length,
    startsAt: riskHours[0]?.forecastAt ?? null,
    endsAt: riskHours.at(-1)?.forecastAt ?? null,
  });
}

export function mergeOfficialWarnings(assessment, warnings, at = assessment.forecastAt) {
  const timestamp = parseTimestamp(at);
  const active = assertArray(warnings, 'Official warnings').filter((warning) => (
    timestamp >= parseTimestamp(warning.startsAt) && timestamp < parseTimestamp(warning.endsAt)
  ));
  const officialSeverity = maximum(active.map((warning) => warning.severityScore ?? 0)) ?? 0;
  return deepFreeze({
    ...assessment,
    officialWarnings: active,
    overall: Math.max(assessment.overall, officialSeverity),
    level: Math.max(assessment.overall, officialSeverity) >= 85 ? 'extreme'
      : Math.max(assessment.overall, officialSeverity) >= 65 ? 'severe'
        : Math.max(assessment.overall, officialSeverity) >= 40 ? 'elevated' : 'low',
  });
}

export function severeWeatherEnergy(periods) {
  const selected = assertArray(periods, 'Forecast periods');
  return round(sum(selected.map((period) => Math.max(0, period.capeJkg ?? 0) * (period.durationHours ?? 1))), 0);
}

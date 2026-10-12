import { assertArray, clamp, deepFreeze, round } from '../core/validation';
import { maximum, minimum } from '../core/statistics';

function flightCategory(ceilingFeet, visibilityStatuteMiles) {
  if (ceilingFeet < 500 || visibilityStatuteMiles < 1) return 'LIFR';
  if (ceilingFeet < 1000 || visibilityStatuteMiles < 3) return 'IFR';
  if (ceilingFeet <= 3000 || visibilityStatuteMiles <= 5) return 'MVFR';
  return 'VFR';
}

function crosswindComponent(speed, windDirection, runwayHeading) {
  if (![speed, windDirection, runwayHeading].every(Number.isFinite)) return null;
  const difference = (windDirection - runwayHeading) * Math.PI / 180;
  return Math.abs(speed * Math.sin(difference));
}

function headwindComponent(speed, windDirection, runwayHeading) {
  if (![speed, windDirection, runwayHeading].every(Number.isFinite)) return null;
  const difference = (windDirection - runwayHeading) * Math.PI / 180;
  return speed * Math.cos(difference);
}

export function assessFlightWeather(period, aircraft = {}, runway = {}) {
  const ceilingFeet = Number.isFinite(period.ceilingFeet)
    ? period.ceilingFeet
    : Number.isFinite(period.cloudBaseMeters) ? period.cloudBaseMeters * 3.28084 : 10_000;
  const visibilityMiles = Number.isFinite(period.visibilityMeters)
    ? period.visibilityMeters / 1609.344
    : 10;
  const windKnots = (period.windSpeedMps ?? 0) * 1.94384;
  const gustKnots = (period.windGustMps ?? period.windSpeedMps ?? 0) * 1.94384;
  const crosswind = crosswindComponent(windKnots, period.windDirectionDegrees, runway.headingDegrees);
  const headwind = headwindComponent(windKnots, period.windDirectionDegrees, runway.headingDegrees);
  const maximumCrosswind = aircraft.maximumCrosswindKnots ?? 15;
  const maximumTailwind = aircraft.maximumTailwindKnots ?? 8;
  let score = 0;
  const reasons = [];
  const category = flightCategory(ceilingFeet, visibilityMiles);
  if (category === 'LIFR') { score += 90; reasons.push('Low ceilings or visibility produce LIFR conditions.'); }
  else if (category === 'IFR') { score += 70; reasons.push('Ceilings or visibility produce IFR conditions.'); }
  else if (category === 'MVFR') { score += 35; reasons.push('Marginal visual flight conditions are expected.'); }
  if (Number.isFinite(crosswind) && crosswind > maximumCrosswind) {
    score += Math.min(50, (crosswind - maximumCrosswind) * 5 + 20);
    reasons.push('Crosswind exceeds the aircraft guideline.');
  }
  if (Number.isFinite(headwind) && headwind < -maximumTailwind) {
    score += 35;
    reasons.push('Tailwind exceeds the aircraft guideline.');
  }
  if (gustKnots - windKnots >= 10) { score += 20; reasons.push('A significant gust spread is expected.'); }
  if (period.thunderstorm || Number(period.condition?.id) >= 200 && Number(period.condition?.id) < 300) {
    score = Math.max(score, 95);
    reasons.push('Thunderstorms are unsafe for routine operations.');
  }
  if ((period.freezingLevelMeters ?? Infinity) <= (aircraft.cruiseAltitudeMeters ?? 3000) && period.cloudPercent >= 60) {
    score += 25;
    reasons.push('In-cloud icing may be possible near the planned altitude.');
  }
  score = clamp(score, 0, 100);
  return deepFreeze({
    score: round(score, 1),
    category,
    level: score >= 85 ? 'no_go' : score >= 60 ? 'high_caution' : score >= 30 ? 'caution' : 'favorable',
    ceilingFeet: round(ceilingFeet, 0),
    visibilityStatuteMiles: round(visibilityMiles, 1),
    windKnots: round(windKnots, 1),
    gustKnots: round(gustKnots, 1),
    crosswindKnots: round(crosswind, 1),
    headwindKnots: round(headwind, 1),
    reasons,
  });
}

export function rankFlightWindows(periods, aircraft = {}, runway = {}) {
  return assertArray(periods, 'Aviation forecast periods', { nonEmpty: true }).map((period) => ({
    forecastAt: period.forecastAt,
    assessment: assessFlightWeather(period, aircraft, runway),
  })).sort((first, second) => first.assessment.score - second.assessment.score
    || String(first.forecastAt).localeCompare(String(second.forecastAt)));
}

export function summarizeFlightWeather(periods, aircraft = {}, runway = {}) {
  const ranked = rankFlightWindows(periods, aircraft, runway);
  return deepFreeze({
    ranked,
    bestAt: ranked[0]?.forecastAt ?? null,
    worstAt: ranked.at(-1)?.forecastAt ?? null,
    minimumRisk: minimum(ranked.map((entry) => entry.assessment.score)),
    maximumRisk: maximum(ranked.map((entry) => entry.assessment.score)),
    noGoPeriods: ranked.filter((entry) => entry.assessment.level === 'no_go').length,
  });
}

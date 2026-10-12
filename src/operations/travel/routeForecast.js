import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  deepFreeze,
  normalizeLocation,
  parseTimestamp,
  round,
} from '../core/validation';
import { maximum, mean, minimum } from '../core/statistics';
import { estimateTravelTimes, haversineDistance, routeDistance, sampleRoute } from '../core/geo';
import { nearestInTime } from '../core/timeSeries';

function closestForecastLocation(point, forecasts, maximumDistanceKm) {
  const candidates = forecasts.map((forecast) => ({
    forecast,
    distanceKm: haversineDistance(point, forecast.location),
  })).sort((first, second) => first.distanceKm - second.distanceKm);
  return candidates[0]?.distanceKm <= maximumDistanceKm ? candidates[0] : null;
}

function normalizeForecast(forecast, index) {
  assertObject(forecast, `Forecast ${index + 1}`);
  const location = normalizeLocation(forecast.location, `Forecast ${index + 1} location`);
  const items = assertArray(forecast.items, `Forecast ${index + 1} items`, { nonEmpty: true });
  return Object.freeze({ location, items });
}

function conditionRisk(item) {
  const code = Number(item?.condition?.id ?? item?.conditionCode);
  const description = String(item?.condition?.description ?? '').toLowerCase();
  if ((code >= 200 && code < 300) || description.includes('thunder')) return 95;
  if ((code >= 500 && code < 600) || description.includes('rain')) return 45;
  if ((code >= 600 && code < 700) || description.includes('snow')) return 75;
  if ((code >= 700 && code < 800) || description.includes('fog') || description.includes('mist')) return 65;
  return 5;
}

function pointRisks(item) {
  if (!item) return [];
  const risks = [];
  const wind = item.windSpeedMps ?? 0;
  const gust = item.windGustMps ?? 0;
  const visibility = item.visibilityMeters;
  const rain = item.rainMm ?? 0;
  const snow = item.snowMm ?? 0;
  const probability = item.precipitationProbability ?? 0;
  const temperature = item.temperatureC;
  if (wind >= 15 || gust >= 22) {
    risks.push({ code: 'strong_wind', severity: wind >= 25 || gust >= 32 ? 90 : 65, message: 'Strong crosswinds may affect travel.' });
  }
  if (Number.isFinite(visibility) && visibility < 3000) {
    risks.push({ code: 'low_visibility', severity: visibility < 500 ? 95 : 70, message: 'Reduced visibility may slow the route.' });
  }
  if (rain >= 5 || probability >= 0.7) {
    risks.push({ code: 'heavy_rain', severity: rain >= 15 ? 90 : 60, message: 'Rain may create spray and standing water.' });
  }
  if (snow >= 1) {
    risks.push({ code: 'snow', severity: snow >= 5 ? 95 : 75, message: 'Snow may make untreated surfaces hazardous.' });
  }
  if (Number.isFinite(temperature) && temperature <= 1 && (rain > 0 || snow > 0 || probability >= 0.5)) {
    risks.push({ code: 'ice', severity: temperature <= -3 ? 95 : 80, message: 'Freezing conditions can produce ice.' });
  }
  const weatherSeverity = conditionRisk(item);
  if (weatherSeverity >= 60) {
    risks.push({ code: 'hazardous_condition', severity: weatherSeverity, message: 'The reported weather condition can disrupt travel.' });
  }
  return risks;
}

function recommendationForScore(score) {
  if (score >= 85) return 'Delay travel if possible and review official warnings.';
  if (score >= 65) return 'Allow extra time and prepare for difficult conditions.';
  if (score >= 40) return 'Use caution and monitor the forecast before departure.';
  if (score >= 20) return 'Minor weather impacts are possible.';
  return 'No significant weather disruption is expected.';
}

export function buildRouteForecast(routeInput, providerForecasts, inputOptions = {}) {
  const route = assertArray(routeInput, 'Route', { nonEmpty: true });
  if (route.length < 2) throw new TypeError('A route needs an origin and destination.');
  const forecasts = assertArray(providerForecasts, 'Route forecasts', { nonEmpty: true }).map(normalizeForecast);
  const options = {
    startsAt: new Date(parseTimestamp(inputOptions.startsAt ?? new Date().toISOString())).toISOString(),
    speedKph: assertFiniteNumber(inputOptions.speedKph ?? 80, 'Travel speed', { minimum: 1, maximum: 500 }),
    spacingKm: assertFiniteNumber(inputOptions.spacingKm ?? 25, 'Route sample spacing', { minimum: 1, maximum: 500 }),
    maximumForecastDistanceKm: assertFiniteNumber(
      inputOptions.maximumForecastDistanceKm ?? 100,
      'Maximum forecast distance',
      { minimum: 1, maximum: 1000 },
    ),
    timeToleranceMinutes: assertFiniteNumber(
      inputOptions.timeToleranceMinutes ?? 120,
      'Forecast time tolerance',
      { minimum: 1, maximum: 1440 },
    ),
  };
  const sampled = sampleRoute(route, { spacingKm: options.spacingKm });
  const timed = estimateTravelTimes(sampled, { startsAt: options.startsAt, speedKph: options.speedKph });
  const points = timed.map((point, index) => {
    const selected = closestForecastLocation(point, forecasts, options.maximumForecastDistanceKm);
    const item = selected ? nearestInTime(selected.forecast.items, point.estimatedAt, {
      timeSelector: (entry) => entry.forecastAt,
      maximumDistanceMs: options.timeToleranceMinutes * 60_000,
    }) : null;
    const risks = pointRisks(item);
    const score = maximum(risks.map((risk) => risk.severity)) ?? 0;
    return deepFreeze({
      index,
      ...point,
      forecastLocation: selected?.forecast.location ?? null,
      forecastDistanceKm: round(selected?.distanceKm, 2),
      forecastAt: item?.forecastAt ?? null,
      conditions: item ? {
        temperatureC: item.temperatureC ?? null,
        windSpeedMps: item.windSpeedMps ?? null,
        windGustMps: item.windGustMps ?? null,
        visibilityMeters: item.visibilityMeters ?? null,
        precipitationProbability: item.precipitationProbability ?? null,
        condition: item.condition ?? null,
      } : null,
      risks,
      riskScore: score,
      recommendation: recommendationForScore(score),
    });
  });
  const scores = points.map((point) => point.riskScore);
  const uncovered = points.filter((point) => !point.conditions);
  const highest = [...points].sort((first, second) => second.riskScore - first.riskScore)[0];
  return deepFreeze({
    generatedAt: new Date().toISOString(),
    startsAt: options.startsAt,
    arrivesAt: points.at(-1).estimatedAt,
    distanceKm: round(routeDistance(route), 2),
    estimatedDurationMinutes: round((parseTimestamp(points.at(-1).estimatedAt) - parseTimestamp(options.startsAt)) / 60_000, 1),
    points,
    summary: {
      riskScore: maximum(scores) ?? 0,
      averageRiskScore: round(mean(scores), 1),
      recommendation: recommendationForScore(maximum(scores) ?? 0),
      highestRiskAt: highest?.estimatedAt ?? null,
      highestRiskDistanceKm: highest?.distanceFromStartKm ?? null,
      coveragePercent: round((points.length - uncovered.length) / points.length * 100, 1),
      minimumTemperatureC: round(minimum(points.map((point) => point.conditions?.temperatureC)), 1),
      maximumTemperatureC: round(maximum(points.map((point) => point.conditions?.temperatureC)), 1),
      maximumWindMps: round(maximum(points.map((point) => point.conditions?.windSpeedMps)), 1),
    },
  });
}

export function compareDepartureTimes(route, forecasts, departures, options = {}) {
  const results = assertArray(departures, 'Departure times', { nonEmpty: true }).map((startsAt) => (
    buildRouteForecast(route, forecasts, { ...options, startsAt })
  ));
  return results.map((result) => ({
    startsAt: result.startsAt,
    arrivesAt: result.arrivesAt,
    riskScore: result.summary.riskScore,
    coveragePercent: result.summary.coveragePercent,
    recommendation: result.summary.recommendation,
  })).sort((first, second) => first.riskScore - second.riskScore || first.startsAt.localeCompare(second.startsAt));
}

import {
  assertArray,
  assertObject,
  assertString,
  deepFreeze,
  normalizeLocation,
  parseTimestamp,
  round,
} from '../core/validation';
import { maximum, mean, minimum, sum } from '../core/statistics';

const SECTION_ORDER = Object.freeze([
  'headline',
  'current_conditions',
  'forecast',
  'hazards',
  'air_quality',
  'travel',
  'operations',
  'recommendations',
]);

const SEVERITY_WEIGHT = Object.freeze({
  unknown: 0,
  information: 1,
  minor: 2,
  moderate: 3,
  severe: 4,
  extreme: 5,
});

function normalizeSeverity(value) {
  const candidate = String(value ?? 'information').toLowerCase();
  return Object.hasOwn(SEVERITY_WEIGHT, candidate) ? candidate : 'information';
}

function normalizeHazard(hazard, index) {
  assertObject(hazard, `Hazard ${index + 1}`);
  const severity = normalizeSeverity(hazard.severity);
  return deepFreeze({
    id: String(hazard.id ?? `hazard-${index + 1}`),
    type: String(hazard.type ?? hazard.event ?? 'weather'),
    title: String(hazard.title ?? hazard.event ?? 'Weather hazard'),
    severity,
    severityWeight: SEVERITY_WEIGHT[severity],
    startsAt: hazard.startsAt ? new Date(parseTimestamp(hazard.startsAt)).toISOString() : null,
    endsAt: hazard.endsAt ? new Date(parseTimestamp(hazard.endsAt)).toISOString() : null,
    instruction: hazard.instruction ?? hazard.recommendation ?? null,
    source: hazard.source ?? null,
  });
}

function normalizePeriod(period, index) {
  assertObject(period, `Forecast period ${index + 1}`);
  const forecastAt = new Date(parseTimestamp(
    period.forecastAt ?? period.observedAt ?? period.dt,
    `Forecast period ${index + 1} time`,
  )).toISOString();
  return deepFreeze({
    forecastAt,
    temperatureC: Number.isFinite(period.temperatureC) ? period.temperatureC : null,
    minimumC: Number.isFinite(period.minimumC) ? period.minimumC : null,
    maximumC: Number.isFinite(period.maximumC) ? period.maximumC : null,
    precipitationProbability: Number.isFinite(period.precipitationProbability)
      ? period.precipitationProbability
      : null,
    precipitationMm: Number.isFinite(period.precipitationMm ?? period.rainMm)
      ? period.precipitationMm ?? period.rainMm
      : null,
    windSpeedMps: Number.isFinite(period.windSpeedMps) ? period.windSpeedMps : null,
    condition: period.condition?.description ?? period.condition ?? null,
    confidence: Number.isFinite(period.confidence) ? period.confidence : null,
  });
}

function rangeSummary(periods) {
  const temperatures = periods.flatMap((period) => [period.minimumC, period.temperatureC, period.maximumC])
    .filter(Number.isFinite);
  const winds = periods.map((period) => period.windSpeedMps).filter(Number.isFinite);
  const rain = periods.map((period) => period.precipitationMm).filter(Number.isFinite);
  const probabilities = periods.map((period) => period.precipitationProbability).filter(Number.isFinite);
  const confidence = periods.map((period) => period.confidence).filter(Number.isFinite);
  return deepFreeze({
    startsAt: periods[0]?.forecastAt ?? null,
    endsAt: periods.at(-1)?.forecastAt ?? null,
    periodCount: periods.length,
    minimumTemperatureC: round(minimum(temperatures), 1),
    maximumTemperatureC: round(maximum(temperatures), 1),
    maximumWindMps: round(maximum(winds), 1),
    totalPrecipitationMm: round(sum(rain), 1),
    maximumPrecipitationProbability: round(maximum(probabilities), 2),
    averageConfidence: round(mean(confidence), 1),
  });
}

function recommendationPriority(recommendation) {
  if (Number.isFinite(recommendation.priority)) return recommendation.priority;
  const severity = normalizeSeverity(recommendation.severity);
  return SEVERITY_WEIGHT[severity] * 10;
}

function normalizeRecommendation(recommendation, index) {
  if (typeof recommendation === 'string') {
    return deepFreeze({
      id: `recommendation-${index + 1}`,
      text: recommendation,
      category: 'general',
      priority: 0,
      source: null,
    });
  }
  assertObject(recommendation, `Recommendation ${index + 1}`);
  return deepFreeze({
    id: String(recommendation.id ?? `recommendation-${index + 1}`),
    text: assertString(recommendation.text ?? recommendation.message, `Recommendation ${index + 1} text`, {
      maximum: 1000,
    }),
    category: String(recommendation.category ?? 'general'),
    priority: recommendationPriority(recommendation),
    source: recommendation.source ?? null,
  });
}

function healthSummary(services) {
  const normalized = assertArray(services ?? [], 'Services').map((service, index) => ({
    id: String(service.id ?? service.name ?? `service-${index + 1}`),
    name: String(service.name ?? service.id ?? `Service ${index + 1}`),
    status: String(service.status ?? 'unknown').toLowerCase(),
    latencyMs: Number.isFinite(service.latencyMs) ? service.latencyMs : null,
    checkedAt: service.checkedAt ? new Date(parseTimestamp(service.checkedAt)).toISOString() : null,
  }));
  const counts = normalized.reduce((summary, service) => {
    summary[service.status] = (summary[service.status] ?? 0) + 1;
    return summary;
  }, {});
  const available = normalized.filter((service) => ['healthy', 'operational', 'degraded'].includes(service.status)).length;
  return deepFreeze({
    services: normalized,
    counts,
    availability: normalized.length ? round(available / normalized.length, 4) : null,
    averageLatencyMs: round(mean(normalized.map((service) => service.latencyMs).filter(Number.isFinite)), 1),
  });
}

function buildHeadline(report) {
  const hazard = report.hazards[0];
  if (hazard?.severityWeight >= SEVERITY_WEIGHT.severe) {
    return `${hazard.title}: ${hazard.instruction ?? 'Review the latest official guidance.'}`;
  }
  const current = report.currentConditions;
  const summary = current?.condition?.description ?? current?.condition ?? null;
  if (summary && Number.isFinite(current?.temperatureC)) {
    return `${summary} and ${round(current.temperatureC, 1)}°C in ${report.location.name}.`;
  }
  if (summary) return `${summary} in ${report.location.name}.`;
  return `Weather operations summary for ${report.location.name}.`;
}

function section(id, title, data, options = {}) {
  return deepFreeze({
    id,
    title,
    visible: options.visible !== false,
    priority: options.priority ?? SECTION_ORDER.indexOf(id),
    data,
  });
}

export function createOperationalWeatherReport(input, options = {}) {
  assertObject(input, 'Operational report input');
  const location = normalizeLocation(input.location);
  const generatedAt = new Date(parseTimestamp(options.generatedAt ?? input.generatedAt ?? Date.now())).toISOString();
  const periods = assertArray(input.forecast ?? [], 'Forecast periods').map(normalizePeriod)
    .sort((first, second) => parseTimestamp(first.forecastAt) - parseTimestamp(second.forecastAt));
  const hazards = assertArray(input.hazards ?? [], 'Hazards').map(normalizeHazard)
    .sort((first, second) => second.severityWeight - first.severityWeight);
  const recommendations = assertArray(input.recommendations ?? [], 'Recommendations')
    .map(normalizeRecommendation)
    .sort((first, second) => second.priority - first.priority);
  const report = {
    id: String(input.id ?? `weather-report:${location.id}:${generatedAt}`),
    generatedAt,
    location,
    currentConditions: input.currentConditions ? deepFreeze({ ...input.currentConditions }) : null,
    periods,
    forecastSummary: rangeSummary(periods),
    hazards,
    airQuality: input.airQuality ? deepFreeze({ ...input.airQuality }) : null,
    travel: input.travel ? deepFreeze({ ...input.travel }) : null,
    operations: healthSummary(input.services),
    recommendations,
    sources: assertArray(input.sources ?? [], 'Report sources').map((source) => deepFreeze({ ...source })),
  };
  report.headline = options.headline ?? buildHeadline(report);
  report.riskLevel = hazards[0]?.severity ?? 'information';
  report.sections = [
    section('headline', 'Summary', report.headline),
    section('current_conditions', 'Current conditions', report.currentConditions, { visible: Boolean(report.currentConditions) }),
    section('forecast', 'Forecast', { periods, summary: report.forecastSummary }, { visible: periods.length > 0 }),
    section('hazards', 'Hazards', hazards, { visible: hazards.length > 0 }),
    section('air_quality', 'Air quality', report.airQuality, { visible: Boolean(report.airQuality) }),
    section('travel', 'Travel readiness', report.travel, { visible: Boolean(report.travel) }),
    section('operations', 'Provider health', report.operations, { visible: report.operations.services.length > 0 }),
    section('recommendations', 'Recommendations', recommendations, { visible: recommendations.length > 0 }),
  ].filter((entry) => options.includeEmptySections === true || entry.visible);
  return deepFreeze(report);
}

export function compareOperationalReports(previous, current) {
  assertObject(previous, 'Previous report');
  assertObject(current, 'Current report');
  if (previous.location?.id !== current.location?.id) throw new TypeError('Reports must describe the same location.');
  const previousHazards = new Map((previous.hazards ?? []).map((hazard) => [hazard.id, hazard]));
  const currentHazards = new Map((current.hazards ?? []).map((hazard) => [hazard.id, hazard]));
  const addedHazards = [...currentHazards.values()].filter((hazard) => !previousHazards.has(hazard.id));
  const clearedHazards = [...previousHazards.values()].filter((hazard) => !currentHazards.has(hazard.id));
  const changedHazards = [...currentHazards.values()].filter((hazard) => {
    const prior = previousHazards.get(hazard.id);
    return prior && (prior.severity !== hazard.severity || prior.title !== hazard.title || prior.endsAt !== hazard.endsAt);
  });
  const previousTemperature = previous.currentConditions?.temperatureC;
  const currentTemperature = current.currentConditions?.temperatureC;
  return deepFreeze({
    location: current.location,
    from: previous.generatedAt,
    to: current.generatedAt,
    addedHazards,
    clearedHazards,
    changedHazards,
    temperatureChangeC: Number.isFinite(previousTemperature) && Number.isFinite(currentTemperature)
      ? round(currentTemperature - previousTemperature, 1)
      : null,
    riskChanged: previous.riskLevel !== current.riskLevel,
    headlineChanged: previous.headline !== current.headline,
    changed: addedHazards.length > 0
      || clearedHazards.length > 0
      || changedHazards.length > 0
      || previous.headline !== current.headline,
  });
}

export function reportDigest(report) {
  assertObject(report, 'Operational report');
  return deepFreeze({
    id: report.id,
    generatedAt: report.generatedAt,
    locationId: report.location?.id ?? null,
    headline: report.headline,
    riskLevel: report.riskLevel,
    hazardCount: report.hazards?.length ?? 0,
    recommendationCount: report.recommendations?.length ?? 0,
    providerAvailability: report.operations?.availability ?? null,
    forecastPeriodCount: report.forecastSummary?.periodCount ?? 0,
  });
}

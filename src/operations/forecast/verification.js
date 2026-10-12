import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import {
  maximum,
  mean,
  meanAbsoluteError,
  minimum,
  rootMeanSquareError,
  standardDeviation,
} from '../core/statistics';
import { nearestInTime, sortByTime } from '../core/timeSeries';

const DEFAULT_FIELDS = Object.freeze([
  'temperatureC',
  'humidityPercent',
  'windSpeedMps',
  'pressureHpa',
  'precipitationProbability',
]);

function normalizeForecastRun(run, index) {
  assertObject(run, `Forecast run ${index + 1}`);
  const id = assertString(run.id ?? `run-${index + 1}`, `Forecast run ${index + 1} id`);
  const providerId = assertString(run.providerId ?? 'unknown', `Forecast run ${id} provider`);
  const issuedAt = new Date(parseTimestamp(run.issuedAt, `Forecast run ${id} issuedAt`)).toISOString();
  const items = sortByTime(assertArray(run.items, `Forecast run ${id} items`, { nonEmpty: true }), (item) => item.forecastAt);
  return Object.freeze({ id, providerId, issuedAt, items });
}

function normalizeObservations(observations) {
  return sortByTime(assertArray(observations, 'Observations', { nonEmpty: true }), (item) => item.observedAt)
    .map((observation, index) => {
      assertObject(observation, `Observation ${index + 1}`);
      return Object.freeze({
        ...observation,
        observedAt: new Date(parseTimestamp(observation.observedAt)).toISOString(),
      });
    });
}

function brierScore(probabilities, outcomes) {
  const squaredErrors = probabilities.map((probability, index) => (
    Number.isFinite(probability) && Number.isFinite(outcomes[index])
      ? (probability - outcomes[index]) ** 2
      : null
  )).filter(Number.isFinite);
  return mean(squaredErrors);
}

function categoricalMatch(forecast, observed) {
  const first = String(forecast ?? '').toLowerCase().replace(/[dn]$/, '').trim();
  const second = String(observed ?? '').toLowerCase().replace(/[dn]$/, '').trim();
  return first && second ? first === second : null;
}

function precipitationObserved(observation, thresholdMm) {
  if (Number.isFinite(observation.precipitationMm)) return observation.precipitationMm >= thresholdMm ? 1 : 0;
  if (Number.isFinite(observation.rainMm)) return observation.rainMm >= thresholdMm ? 1 : 0;
  if (Number.isFinite(observation.snowMm)) return observation.snowMm >= thresholdMm ? 1 : 0;
  return null;
}

function verifyMatch(run, forecast, observation, options) {
  const forecastTime = parseTimestamp(forecast.forecastAt);
  const observedTime = parseTimestamp(observation.observedAt);
  const leadHours = (forecastTime - parseTimestamp(run.issuedAt)) / 3_600_000;
  const fieldErrors = Object.fromEntries(options.fields.map((field) => [
    field,
    Number.isFinite(forecast[field]) && Number.isFinite(observation[field])
      ? round(forecast[field] - observation[field], 4)
      : null,
  ]));
  const precipitationOutcome = precipitationObserved(observation, options.precipitationThresholdMm);
  const precipitationProbability = Number.isFinite(forecast.precipitationProbability)
    ? Math.min(1, Math.max(0, forecast.precipitationProbability))
    : null;
  return Object.freeze({
    runId: run.id,
    providerId: run.providerId,
    issuedAt: run.issuedAt,
    forecastAt: new Date(forecastTime).toISOString(),
    observedAt: new Date(observedTime).toISOString(),
    matchDifferenceMinutes: Math.abs(observedTime - forecastTime) / 60_000,
    leadHours: round(leadHours, 2),
    fieldErrors,
    conditionMatched: categoricalMatch(
      forecast.condition?.iconCode ?? forecast.condition?.code ?? forecast.condition,
      observation.condition?.iconCode ?? observation.condition?.code ?? observation.condition,
    ),
    precipitationProbability,
    precipitationOutcome,
    precipitationBrier: Number.isFinite(precipitationProbability) && Number.isFinite(precipitationOutcome)
      ? (precipitationProbability - precipitationOutcome) ** 2
      : null,
  });
}

function summarizeField(matches, field) {
  const errors = matches.map((match) => match.fieldErrors[field]).filter(Number.isFinite);
  const actual = [];
  const predicted = [];
  matches.forEach((match) => {
    const error = match.fieldErrors[field];
    if (!Number.isFinite(error)) return;
    actual.push(0);
    predicted.push(error);
  });
  return Object.freeze({
    count: errors.length,
    bias: round(mean(errors), 4),
    meanAbsoluteError: round(meanAbsoluteError(actual, predicted), 4),
    rootMeanSquareError: round(rootMeanSquareError(actual, predicted), 4),
    standardDeviation: round(standardDeviation(errors), 4),
    minimumError: round(minimum(errors), 4),
    maximumError: round(maximum(errors), 4),
  });
}

function summarizeMatches(matches, fields) {
  const categorical = matches.map((match) => match.conditionMatched).filter((value) => value !== null);
  const probabilities = matches.map((match) => match.precipitationProbability);
  const outcomes = matches.map((match) => match.precipitationOutcome);
  return deepFreeze({
    matchCount: matches.length,
    fields: Object.fromEntries(fields.map((field) => [field, summarizeField(matches, field)])),
    conditionAccuracy: categorical.length
      ? round(categorical.filter(Boolean).length / categorical.length, 4)
      : null,
    precipitationBrierScore: round(brierScore(probabilities, outcomes), 4),
    averageMatchDifferenceMinutes: round(mean(matches.map((match) => match.matchDifferenceMinutes)), 2),
    leadHours: {
      minimum: round(minimum(matches.map((match) => match.leadHours)), 2),
      maximum: round(maximum(matches.map((match) => match.leadHours)), 2),
      average: round(mean(matches.map((match) => match.leadHours)), 2),
    },
  });
}

export function verifyForecastRuns(forecastRuns, observations, inputOptions = {}) {
  const runs = assertArray(forecastRuns, 'Forecast runs', { nonEmpty: true }).map(normalizeForecastRun);
  const actual = normalizeObservations(observations);
  const options = {
    toleranceMs: assertFiniteNumber(
      inputOptions.toleranceMinutes ?? 90,
      'Match tolerance',
      { minimum: 0 },
    ) * 60_000,
    precipitationThresholdMm: assertFiniteNumber(
      inputOptions.precipitationThresholdMm ?? 0.1,
      'Precipitation threshold',
      { minimum: 0 },
    ),
    fields: Array.isArray(inputOptions.fields) && inputOptions.fields.length
      ? inputOptions.fields.map((field) => assertString(field, 'Verification field'))
      : DEFAULT_FIELDS,
  };
  const matches = [];
  const unmatchedForecasts = [];
  runs.forEach((run) => {
    run.items.forEach((forecast) => {
      const observation = nearestInTime(actual, forecast.forecastAt, {
        timeSelector: (item) => item.observedAt,
        maximumDistanceMs: options.toleranceMs,
      });
      if (!observation) {
        unmatchedForecasts.push(Object.freeze({ runId: run.id, forecastAt: forecast.forecastAt }));
        return;
      }
      matches.push(verifyMatch(run, forecast, observation, options));
    });
  });
  const byRun = Object.fromEntries(runs.map((run) => {
    const selected = matches.filter((match) => match.runId === run.id);
    return [run.id, summarizeMatches(selected, options.fields)];
  }));
  const providerIds = [...new Set(runs.map((run) => run.providerId))];
  const byProvider = Object.fromEntries(providerIds.map((providerId) => {
    const selected = matches.filter((match) => match.providerId === providerId);
    return [providerId, summarizeMatches(selected, options.fields)];
  }));
  return deepFreeze({
    generatedAt: new Date().toISOString(),
    matches,
    unmatchedForecasts,
    overall: summarizeMatches(matches, options.fields),
    byRun,
    byProvider,
  });
}

export function reliabilityFromVerification(report, options = {}) {
  const temperatureTarget = Number.isFinite(options.temperatureMaeTarget)
    ? options.temperatureMaeTarget
    : 3;
  const windTarget = Number.isFinite(options.windMaeTarget) ? options.windMaeTarget : 4;
  const temperatureMae = report?.overall?.fields?.temperatureC?.meanAbsoluteError;
  const windMae = report?.overall?.fields?.windSpeedMps?.meanAbsoluteError;
  const conditionAccuracy = report?.overall?.conditionAccuracy;
  const brier = report?.overall?.precipitationBrierScore;
  const components = [
    Number.isFinite(temperatureMae) ? Math.max(0, 1 - temperatureMae / temperatureTarget) : null,
    Number.isFinite(windMae) ? Math.max(0, 1 - windMae / windTarget) : null,
    Number.isFinite(conditionAccuracy) ? conditionAccuracy : null,
    Number.isFinite(brier) ? Math.max(0, 1 - brier) : null,
  ].filter(Number.isFinite);
  return components.length ? round(mean(components), 4) : null;
}

export function rankProviders(verificationReport) {
  const providers = Object.entries(verificationReport?.byProvider ?? {}).map(([providerId, report]) => ({
    providerId,
    reliability: reliabilityFromVerification({ overall: report }),
    matchCount: report.matchCount,
    temperatureMae: report.fields?.temperatureC?.meanAbsoluteError ?? null,
    precipitationBrierScore: report.precipitationBrierScore,
  }));
  return providers.sort((first, second) => (
    (second.reliability ?? -1) - (first.reliability ?? -1)
    || second.matchCount - first.matchCount
    || first.providerId.localeCompare(second.providerId)
  ));
}

export const VERIFICATION_FIELDS = DEFAULT_FIELDS;

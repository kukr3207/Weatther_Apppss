import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import { maximum, mean, minimum, quantile, sum } from '../core/statistics';

const ADJUSTABLE_FIELDS = Object.freeze([
  'temperatureC',
  'feelsLikeC',
  'minimumC',
  'maximumC',
  'humidityPercent',
  'precipitationProbability',
  'rainMm',
  'snowMm',
  'windSpeedMps',
  'windGustMps',
  'pressureHpa',
  'visibilityMeters',
  'cloudPercent',
  'uvIndex',
]);

function normalizeAdjustment(adjustment, index) {
  assertObject(adjustment, `Scenario adjustment ${index + 1}`);
  const field = assertString(adjustment.field, `Scenario adjustment ${index + 1} field`);
  if (!ADJUSTABLE_FIELDS.includes(field)) throw new TypeError(`Scenario field ${field} cannot be adjusted.`);
  const operation = ['add', 'multiply', 'set', 'minimum', 'maximum'].includes(adjustment.operation)
    ? adjustment.operation
    : 'add';
  const value = assertFiniteNumber(adjustment.value, `Scenario adjustment ${index + 1} value`);
  return deepFreeze({
    field,
    operation,
    value,
    startsAt: adjustment.startsAt ? new Date(parseTimestamp(adjustment.startsAt)).toISOString() : null,
    endsAt: adjustment.endsAt ? new Date(parseTimestamp(adjustment.endsAt)).toISOString() : null,
    hours: Array.isArray(adjustment.hours) ? adjustment.hours.map(Number).filter(Number.isFinite) : null,
  });
}

function applies(adjustment, item) {
  const timestamp = parseTimestamp(item.forecastAt ?? item.observedAt);
  if (adjustment.startsAt && timestamp < parseTimestamp(adjustment.startsAt)) return false;
  if (adjustment.endsAt && timestamp >= parseTimestamp(adjustment.endsAt)) return false;
  if (adjustment.hours && !adjustment.hours.includes(new Date(timestamp).getUTCHours())) return false;
  return true;
}

function adjustValue(current, adjustment) {
  if (adjustment.operation === 'set') return adjustment.value;
  if (!Number.isFinite(current)) return current;
  if (adjustment.operation === 'multiply') return current * adjustment.value;
  if (adjustment.operation === 'minimum') return Math.max(current, adjustment.value);
  if (adjustment.operation === 'maximum') return Math.min(current, adjustment.value);
  return current + adjustment.value;
}

function constrain(field, value) {
  if (!Number.isFinite(value)) return value;
  if (field === 'precipitationProbability') return Math.max(0, Math.min(1, value));
  if (['humidityPercent', 'cloudPercent'].includes(field)) return Math.max(0, Math.min(100, value));
  if (['rainMm', 'snowMm', 'windSpeedMps', 'windGustMps', 'visibilityMeters', 'uvIndex'].includes(field)) {
    return Math.max(0, value);
  }
  return value;
}

export function createForecastScenario(input, options = {}) {
  assertObject(input, 'Forecast scenario');
  const id = assertString(input.id, 'Scenario id', { maximum: 160 });
  const name = assertString(input.name, 'Scenario name', { maximum: 240 });
  const adjustments = assertArray(input.adjustments, 'Scenario adjustments', { nonEmpty: true }).map(normalizeAdjustment);
  return deepFreeze({
    id,
    name,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    probability: assertFiniteNumber(input.probability ?? 0.5, 'Scenario probability', { minimum: 0, maximum: 1 }),
    adjustments,
    tags: [...new Set(assertArray(input.tags ?? [], 'Scenario tags').map(String))],
    createdAt: new Date(parseTimestamp(input.createdAt ?? options.now ?? Date.now())).toISOString(),
  });
}

export function applyForecastScenario(inputForecast, inputScenario) {
  const forecast = assertArray(inputForecast, 'Forecast periods', { nonEmpty: true });
  const scenario = inputScenario.adjustments?.every((adjustment) => Object.isFrozen(adjustment))
    ? inputScenario
    : createForecastScenario(inputScenario);
  const periods = forecast.map((item, index) => {
    const forecastAt = new Date(parseTimestamp(item.forecastAt ?? item.observedAt, `Forecast period ${index + 1} time`)).toISOString();
    const appliedAdjustments = scenario.adjustments.filter((adjustment) => applies(adjustment, { ...item, forecastAt }));
    const adjusted = { ...item, forecastAt };
    appliedAdjustments.forEach((adjustment) => {
      adjusted[adjustment.field] = round(constrain(
        adjustment.field,
        adjustValue(adjusted[adjustment.field], adjustment),
      ), 3);
    });
    return deepFreeze({
      ...adjusted,
      scenario: { id: scenario.id, appliedFields: [...new Set(appliedAdjustments.map((entry) => entry.field))] },
    });
  });
  return deepFreeze({ scenario, periods, summary: summarizeScenario(periods) });
}

function summarizeScenario(periods) {
  const temperatures = periods.map((period) => period.temperatureC).filter(Number.isFinite);
  const rain = periods.map((period) => period.rainMm).filter(Number.isFinite);
  const wind = periods.map((period) => period.windSpeedMps).filter(Number.isFinite);
  const probabilities = periods.map((period) => period.precipitationProbability).filter(Number.isFinite);
  return deepFreeze({
    periodCount: periods.length,
    minimumTemperatureC: round(minimum(temperatures), 1),
    maximumTemperatureC: round(maximum(temperatures), 1),
    averageTemperatureC: round(mean(temperatures), 1),
    totalRainMm: round(sum(rain), 1),
    maximumWindMps: round(maximum(wind), 1),
    maximumPrecipitationProbability: round(maximum(probabilities), 2),
  });
}

function difference(baseline, scenario, field) {
  return Number.isFinite(baseline?.[field]) && Number.isFinite(scenario?.[field])
    ? round(scenario[field] - baseline[field], 3)
    : null;
}

export function compareForecastScenarios(baselineInput, scenarioResults) {
  const baseline = assertArray(baselineInput, 'Baseline forecast', { nonEmpty: true });
  const baselineByTime = new Map(baseline.map((period) => [
    new Date(parseTimestamp(period.forecastAt ?? period.observedAt)).toISOString(),
    period,
  ]));
  const comparisons = assertArray(scenarioResults, 'Scenario results', { nonEmpty: true }).map((result) => {
    const changes = result.periods.map((period) => {
      const reference = baselineByTime.get(period.forecastAt);
      return {
        forecastAt: period.forecastAt,
        temperatureC: difference(reference, period, 'temperatureC'),
        rainMm: difference(reference, period, 'rainMm'),
        windSpeedMps: difference(reference, period, 'windSpeedMps'),
        precipitationProbability: difference(reference, period, 'precipitationProbability'),
      };
    });
    return deepFreeze({
      scenario: result.scenario,
      summary: result.summary,
      changes,
      maximumTemperatureChangeC: round(maximum(changes.map((entry) => Math.abs(entry.temperatureC)).filter(Number.isFinite)), 2),
      totalRainChangeMm: round(sum(changes.map((entry) => entry.rainMm).filter(Number.isFinite)), 2),
      maximumWindChangeMps: round(maximum(changes.map((entry) => Math.abs(entry.windSpeedMps)).filter(Number.isFinite)), 2),
    });
  });
  return deepFreeze({ baseline: summarizeScenario(baseline), scenarios: comparisons });
}

export function buildScenarioEnvelope(scenarioResults, field, options = {}) {
  if (!ADJUSTABLE_FIELDS.includes(field)) throw new TypeError(`Scenario field ${field} is not supported.`);
  const byTime = new Map();
  assertArray(scenarioResults, 'Scenario results', { nonEmpty: true }).forEach((result) => {
    result.periods.forEach((period) => {
      if (!Number.isFinite(period[field])) return;
      if (!byTime.has(period.forecastAt)) byTime.set(period.forecastAt, []);
      byTime.get(period.forecastAt).push({
        value: period[field],
        probability: result.scenario.probability,
        scenarioId: result.scenario.id,
      });
    });
  });
  const quantiles = options.quantiles ?? [0.1, 0.5, 0.9];
  const periods = [...byTime.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([forecastAt, entries]) => {
    const values = entries.map((entry) => entry.value);
    const probabilityTotal = sum(entries.map((entry) => entry.probability));
    const weightedMean = probabilityTotal
      ? sum(entries.map((entry) => entry.value * entry.probability)) / probabilityTotal
      : mean(values);
    return deepFreeze({
      forecastAt,
      minimum: round(minimum(values), 3),
      maximum: round(maximum(values), 3),
      mean: round(weightedMean, 3),
      quantiles: Object.fromEntries(quantiles.map((level) => [String(level), round(quantile(values, level), 3)])),
      members: entries,
    });
  });
  return deepFreeze({ field, scenarioCount: scenarioResults.length, periods });
}

export function scenarioDecisionMatrix(scenarioResults, decisions, options = {}) {
  const normalizedDecisions = assertArray(decisions, 'Scenario decisions', { nonEmpty: true }).map((decision, index) => ({
    id: assertString(decision.id ?? `decision-${index + 1}`, `Decision ${index + 1} id`),
    label: assertString(decision.label, `Decision ${index + 1} label`),
    evaluate: decision.evaluate,
  }));
  const rows = scenarioResults.map((result) => {
    const outcomes = normalizedDecisions.map((decision) => {
      if (typeof decision.evaluate !== 'function') throw new TypeError(`Decision ${decision.id} needs an evaluate function.`);
      const outcome = decision.evaluate(result);
      const utility = typeof outcome === 'number' ? outcome : outcome.utility;
      return deepFreeze({
        decisionId: decision.id,
        utility: assertFiniteNumber(utility, `Decision ${decision.id} utility`),
        details: typeof outcome === 'number' ? null : outcome.details ?? null,
      });
    });
    return deepFreeze({ scenarioId: result.scenario.id, probability: result.scenario.probability, outcomes });
  });
  const ranking = normalizedDecisions.map((decision) => {
    const outcomes = rows.map((row) => ({
      probability: row.probability,
      utility: row.outcomes.find((outcome) => outcome.decisionId === decision.id).utility,
    }));
    const probability = sum(outcomes.map((outcome) => outcome.probability));
    return {
      id: decision.id,
      label: decision.label,
      expectedUtility: round(probability
        ? sum(outcomes.map((outcome) => outcome.probability * outcome.utility)) / probability
        : mean(outcomes.map((outcome) => outcome.utility)), 3),
      worstCaseUtility: minimum(outcomes.map((outcome) => outcome.utility)),
      bestCaseUtility: maximum(outcomes.map((outcome) => outcome.utility)),
    };
  }).sort((first, second) => (
    options.strategy === 'maximin'
      ? second.worstCaseUtility - first.worstCaseUtility
      : second.expectedUtility - first.expectedUtility
  ));
  return deepFreeze({ rows, ranking: ranking.map((entry, index) => ({ ...entry, rank: index + 1 })) });
}

export const FORECAST_SCENARIO_FIELDS = ADJUSTABLE_FIELDS;

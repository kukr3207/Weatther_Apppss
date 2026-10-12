import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  assertString,
  clamp,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import {
  maximum,
  mean,
  minimum,
  normalizeWeights,
  standardDeviation,
  weightedMean,
  weightedMedian,
} from '../core/statistics';
import { nearestInTime, sortByTime } from '../core/timeSeries';

const DEFAULT_TOLERANCE_MS = 90 * 60_000;
const NUMERIC_FIELDS = Object.freeze([
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
]);

function normalizeReliability(value) {
  return clamp(Number.isFinite(value) ? value : 1, 0.05, 1);
}

function normalizeProvider(provider, index) {
  assertObject(provider, `Provider ${index + 1}`);
  const id = assertString(provider.id, `Provider ${index + 1} id`, { maximum: 80 });
  const items = assertArray(provider.items, `Provider ${id} forecast`, { nonEmpty: true });
  return Object.freeze({
    id,
    name: typeof provider.name === 'string' && provider.name.trim() ? provider.name.trim() : id,
    reliability: normalizeReliability(provider.reliability),
    issuedAt: provider.issuedAt ? new Date(parseTimestamp(provider.issuedAt)).toISOString() : null,
    items: sortByTime(items, (item) => item.forecastAt),
  });
}

function recencyWeight(provider, targetTime, halfLifeHours) {
  if (!provider.issuedAt) return 1;
  const ageHours = Math.max(0, targetTime - parseTimestamp(provider.issuedAt)) / 3_600_000;
  return 0.5 ** (ageHours / halfLifeHours);
}

function horizonWeight(targetTime, issuedAt, decayHours) {
  if (!issuedAt) return 1;
  const horizonHours = Math.max(0, targetTime - parseTimestamp(issuedAt)) / 3_600_000;
  return Math.max(0.25, 1 - Math.min(horizonHours, decayHours) / (decayHours * 1.5));
}

function memberWeight(provider, targetTime, options) {
  const recency = recencyWeight(provider, targetTime, options.recencyHalfLifeHours);
  const horizon = horizonWeight(targetTime, provider.issuedAt, options.horizonDecayHours);
  return provider.reliability * recency * horizon;
}

function circularMean(entries, valueSelector, weightSelector) {
  let x = 0;
  let y = 0;
  let total = 0;
  entries.forEach((entry) => {
    const value = valueSelector(entry);
    const weight = weightSelector(entry);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) return;
    const angle = value * Math.PI / 180;
    x += Math.cos(angle) * weight;
    y += Math.sin(angle) * weight;
    total += weight;
  });
  if (!total) return null;
  return (Math.atan2(y / total, x / total) * 180 / Math.PI + 360) % 360;
}

function dominantCondition(members) {
  const groups = new Map();
  members.forEach((member) => {
    const condition = member.item?.condition;
    if (!condition) return;
    const key = String(condition.iconCode ?? condition.code ?? condition.description ?? 'unknown')
      .replace(/[dn]$/, '')
      .toLowerCase();
    const current = groups.get(key) ?? {
      key,
      weight: 0,
      condition,
      providers: [],
    };
    current.weight += member.weight;
    current.providers.push(member.provider.id);
    groups.set(key, current);
  });
  const selected = [...groups.values()].sort((first, second) => second.weight - first.weight)[0];
  return selected
    ? Object.freeze({ ...selected.condition, agreementWeight: round(selected.weight, 4) })
    : null;
}

function fieldConsensus(members, field, options) {
  const entries = members
    .filter((member) => Number.isFinite(member.item?.[field]))
    .map((member) => ({
      providerId: member.provider.id,
      value: member.item[field],
      weight: member.weight,
    }));
  if (!entries.length) return Object.freeze({ value: null, spread: null, members: [] });
  const value = options.numericReducer === 'weighted_median'
    ? weightedMedian(entries)
    : weightedMean(entries);
  const spread = standardDeviation(entries.map((entry) => entry.value));
  return Object.freeze({
    value: round(value, options.decimalPlaces),
    spread: round(spread, options.decimalPlaces),
    minimum: round(minimum(entries.map((entry) => entry.value)), options.decimalPlaces),
    maximum: round(maximum(entries.map((entry) => entry.value)), options.decimalPlaces),
    members: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
  });
}

function confidenceForMembers(members, fields, options) {
  if (!members.length) return 0;
  const providerCoverage = Math.min(1, members.length / options.expectedProviders);
  const reliability = mean(members.map((member) => member.provider.reliability)) ?? 0;
  const fieldCoverage = mean(fields.map((field) => (field.value === null ? 0 : 1))) ?? 0;
  const disagreementScores = fields
    .filter((field) => Number.isFinite(field.value) && Number.isFinite(field.spread))
    .map((field) => 1 / (1 + field.spread / Math.max(1, Math.abs(field.value))));
  const agreement = mean(disagreementScores) ?? 0.5;
  return round(clamp(
    providerCoverage * 25 + reliability * 30 + fieldCoverage * 15 + agreement * 30,
    0,
    100,
  ), 1);
}

function buildTargetTimes(providers, options) {
  if (Array.isArray(options.targetTimes) && options.targetTimes.length) {
    return [...new Set(options.targetTimes.map((value) => new Date(parseTimestamp(value)).toISOString()))]
      .sort();
  }
  return [...new Set(providers.flatMap((provider) => provider.items.map((item) => (
    new Date(parseTimestamp(item.forecastAt)).toISOString()
  ))))].sort();
}

function consensusAt(target, providers, options) {
  const targetTime = parseTimestamp(target);
  const members = providers.map((provider) => {
    const item = nearestInTime(provider.items, targetTime, {
      timeSelector: (entry) => entry.forecastAt,
      maximumDistanceMs: options.toleranceMs,
    });
    if (!item) return null;
    return Object.freeze({
      provider,
      item,
      weight: memberWeight(provider, targetTime, options),
    });
  }).filter(Boolean);
  const normalizedWeights = normalizeWeights(members, (member) => member.weight);
  const normalizedMembers = members.map((member, index) => Object.freeze({
    ...member,
    weight: normalizedWeights[index],
  }));
  const fields = Object.fromEntries(NUMERIC_FIELDS.map((field) => [
    field,
    fieldConsensus(normalizedMembers, field, options),
  ]));
  const windDirectionDegrees = circularMean(
    normalizedMembers,
    (member) => member.item.windDirectionDegrees,
    (member) => member.weight,
  );
  const confidence = confidenceForMembers(normalizedMembers, Object.values(fields), options);
  return deepFreeze({
    forecastAt: new Date(targetTime).toISOString(),
    providerCount: normalizedMembers.length,
    providers: normalizedMembers.map((member) => ({
      id: member.provider.id,
      name: member.provider.name,
      weight: round(member.weight, 4),
      matchedAt: new Date(parseTimestamp(member.item.forecastAt)).toISOString(),
    })),
    ...Object.fromEntries(Object.entries(fields).map(([field, summary]) => [field, summary.value])),
    windDirectionDegrees: round(windDirectionDegrees, options.decimalPlaces),
    condition: dominantCondition(normalizedMembers),
    confidence,
    disagreement: Object.fromEntries(Object.entries(fields).map(([field, summary]) => [field, summary.spread])),
    ranges: Object.fromEntries(Object.entries(fields).map(([field, summary]) => [field, {
      minimum: summary.minimum,
      maximum: summary.maximum,
    }])),
  });
}

export function buildForecastConsensus(providerForecasts, inputOptions = {}) {
  const providers = assertArray(providerForecasts, 'Provider forecasts', { nonEmpty: true })
    .map(normalizeProvider);
  const identifiers = new Set();
  providers.forEach((provider) => {
    if (identifiers.has(provider.id)) throw new TypeError(`Provider id ${provider.id} is duplicated.`);
    identifiers.add(provider.id);
  });
  const options = {
    toleranceMs: Number.isFinite(inputOptions.toleranceMs)
      ? Math.max(0, inputOptions.toleranceMs)
      : DEFAULT_TOLERANCE_MS,
    recencyHalfLifeHours: assertFiniteNumber(
      inputOptions.recencyHalfLifeHours ?? 12,
      'Recency half-life',
      { minimum: 1 },
    ),
    horizonDecayHours: assertFiniteNumber(
      inputOptions.horizonDecayHours ?? 168,
      'Horizon decay',
      { minimum: 1 },
    ),
    expectedProviders: assertFiniteNumber(
      inputOptions.expectedProviders ?? Math.min(3, providers.length),
      'Expected provider count',
      { minimum: 1 },
    ),
    numericReducer: inputOptions.numericReducer === 'weighted_median'
      ? 'weighted_median'
      : 'weighted_mean',
    decimalPlaces: Number.isInteger(inputOptions.decimalPlaces)
      ? clamp(inputOptions.decimalPlaces, 0, 6)
      : 2,
    targetTimes: inputOptions.targetTimes,
  };
  const items = buildTargetTimes(providers, options)
    .map((target) => consensusAt(target, providers, options))
    .filter((item) => item.providerCount > 0);
  return deepFreeze({
    generatedAt: new Date().toISOString(),
    providerCount: providers.length,
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      reliability: provider.reliability,
      issuedAt: provider.issuedAt,
    })),
    items,
    summary: {
      averageConfidence: round(mean(items.map((item) => item.confidence)), 1),
      minimumConfidence: round(minimum(items.map((item) => item.confidence)), 1),
      coveredPeriods: items.length,
      completePeriods: items.filter((item) => item.providerCount === providers.length).length,
    },
  });
}

export function compareProviderToConsensus(providerForecast, consensus) {
  const provider = normalizeProvider(providerForecast, 0);
  const items = Array.isArray(consensus?.items) ? consensus.items : [];
  const comparisons = items.map((reference) => {
    const item = nearestInTime(provider.items, reference.forecastAt, {
      timeSelector: (entry) => entry.forecastAt,
      maximumDistanceMs: DEFAULT_TOLERANCE_MS,
    });
    const differences = Object.fromEntries(NUMERIC_FIELDS.map((field) => [
      field,
      Number.isFinite(item?.[field]) && Number.isFinite(reference[field])
        ? round(item[field] - reference[field], 3)
        : null,
    ]));
    return Object.freeze({ forecastAt: reference.forecastAt, matchedAt: item?.forecastAt ?? null, differences });
  });
  return deepFreeze({
    providerId: provider.id,
    comparisons,
    meanAbsoluteDifferences: Object.fromEntries(NUMERIC_FIELDS.map((field) => {
      const values = comparisons.map((entry) => Math.abs(entry.differences[field])).filter(Number.isFinite);
      return [field, round(mean(values), 3)];
    })),
  });
}

export const CONSENSUS_FIELDS = NUMERIC_FIELDS;

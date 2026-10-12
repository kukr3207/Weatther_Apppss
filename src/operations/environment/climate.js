import { assertArray, assertInteger, deepFreeze, parseTimestamp, round } from '../core/validation';
import { linearRegression, maximum, mean, median, minimum, quantile, standardDeviation, sum } from '../core/statistics';

function dateParts(value) {
  const date = new Date(parseTimestamp(value));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    dayOfYear: Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000),
  };
}

function normalizeRecord(record, index) {
  const observedAt = new Date(parseTimestamp(record.observedAt ?? record.date, `Climate record ${index + 1} date`)).toISOString();
  return Object.freeze({
    ...record,
    observedAt,
    ...dateParts(observedAt),
  });
}

function periodKey(record, period) {
  if (period === 'day_of_year') return String(record.dayOfYear).padStart(3, '0');
  if (period === 'month_day') return `${String(record.month).padStart(2, '0')}-${String(record.day).padStart(2, '0')}`;
  if (period === 'year') return String(record.year);
  return String(record.month).padStart(2, '0');
}

function summarizePeriod(records) {
  const temperatures = records.map((record) => record.temperatureC).filter(Number.isFinite);
  const minimums = records.map((record) => record.minimumC).filter(Number.isFinite);
  const maximums = records.map((record) => record.maximumC).filter(Number.isFinite);
  const precipitation = records.map((record) => record.precipitationMm ?? record.rainMm).filter(Number.isFinite);
  const winds = records.map((record) => record.windSpeedMps).filter(Number.isFinite);
  return deepFreeze({
    sampleCount: records.length,
    years: [...new Set(records.map((record) => record.year))].sort(),
    temperatureC: {
      mean: round(mean(temperatures), 2),
      median: round(median(temperatures), 2),
      standardDeviation: round(standardDeviation(temperatures), 2),
      p10: round(quantile(temperatures, 0.1), 2),
      p90: round(quantile(temperatures, 0.9), 2),
      recordLow: round(minimum(minimums.length ? minimums : temperatures), 2),
      recordHigh: round(maximum(maximums.length ? maximums : temperatures), 2),
    },
    precipitationMm: {
      mean: round(mean(precipitation), 2),
      median: round(median(precipitation), 2),
      total: round(sum(precipitation), 2),
      wetFrequency: precipitation.length
        ? round(precipitation.filter((value) => value >= 0.1).length / precipitation.length, 4)
        : null,
      p90: round(quantile(precipitation, 0.9), 2),
    },
    windSpeedMps: {
      mean: round(mean(winds), 2),
      maximum: round(maximum(winds), 2),
    },
  });
}

export function calculateClimateNormals(inputRecords, options = {}) {
  const records = assertArray(inputRecords, 'Climate records', { nonEmpty: true }).map(normalizeRecord);
  const startYear = options.startYear ?? minimum(records.map((record) => record.year));
  const endYear = options.endYear ?? maximum(records.map((record) => record.year));
  const period = ['month', 'month_day', 'day_of_year', 'year'].includes(options.period) ? options.period : 'month';
  const selected = records.filter((record) => record.year >= startYear && record.year <= endYear);
  const groups = new Map();
  selected.forEach((record) => {
    const key = periodKey(record, period);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const normals = Object.fromEntries([...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, values]) => [key, summarizePeriod(values)]));
  return deepFreeze({
    period,
    startYear,
    endYear,
    recordCount: selected.length,
    normals,
  });
}

export function compareWithClimateNormal(observation, climateNormals) {
  const normalized = normalizeRecord(observation, 0);
  const key = periodKey(normalized, climateNormals.period);
  const normal = climateNormals.normals[key];
  if (!normal) return deepFreeze({ key, normal: null, anomalies: {} });
  const temperature = normalized.temperatureC ?? mean([normalized.minimumC, normalized.maximumC].filter(Number.isFinite));
  const precipitation = normalized.precipitationMm ?? normalized.rainMm;
  return deepFreeze({
    key,
    normal,
    anomalies: {
      temperatureC: Number.isFinite(temperature) && Number.isFinite(normal.temperatureC.mean)
        ? round(temperature - normal.temperatureC.mean, 2)
        : null,
      precipitationMm: Number.isFinite(precipitation) && Number.isFinite(normal.precipitationMm.mean)
        ? round(precipitation - normal.precipitationMm.mean, 2)
        : null,
      windSpeedMps: Number.isFinite(normalized.windSpeedMps) && Number.isFinite(normal.windSpeedMps.mean)
        ? round(normalized.windSpeedMps - normal.windSpeedMps.mean, 2)
        : null,
    },
    percentiles: {
      temperature: Number.isFinite(temperature) && Number.isFinite(normal.temperatureC.p10)
        ? temperature < normal.temperatureC.p10 ? 'below_p10'
          : temperature > normal.temperatureC.p90 ? 'above_p90' : 'typical'
        : null,
      precipitation: Number.isFinite(precipitation) && Number.isFinite(normal.precipitationMm.p90)
        ? precipitation > normal.precipitationMm.p90 ? 'above_p90' : 'typical'
        : null,
    },
  });
}

export function detectClimateTrend(inputRecords, field = 'temperatureC', options = {}) {
  const records = assertArray(inputRecords, 'Climate records', { nonEmpty: true }).map(normalizeRecord)
    .filter((record) => Number.isFinite(record[field]));
  const baselineYear = options.baselineYear ?? minimum(records.map((record) => record.year));
  const annual = new Map();
  records.forEach((record) => {
    if (!annual.has(record.year)) annual.set(record.year, []);
    annual.get(record.year).push(record[field]);
  });
  const points = [...annual.entries()].sort(([first], [second]) => first - second).map(([year, values]) => ({
    year,
    x: year - baselineYear,
    y: mean(values),
    sampleCount: values.length,
  }));
  const regression = linearRegression(points);
  return deepFreeze({
    field,
    baselineYear,
    annual: points.map((point) => ({ year: point.year, value: round(point.y, 3), sampleCount: point.sampleCount })),
    slopePerYear: round(regression.slope, 4),
    changePerDecade: round((regression.slope ?? 0) * 10, 3),
    correlation: round(regression.correlation, 4),
    direction: Math.abs(regression.slope ?? 0) < 0.001 ? 'stable' : regression.slope > 0 ? 'increasing' : 'decreasing',
  });
}

export function findClimateRecords(inputRecords, field, options = {}) {
  const records = assertArray(inputRecords, 'Climate records', { nonEmpty: true }).map(normalizeRecord)
    .filter((record) => Number.isFinite(record[field]));
  const mode = options.mode === 'minimum' ? 'minimum' : 'maximum';
  const count = assertInteger(options.count ?? 10, 'Record count', { minimum: 1, maximum: 1000 });
  return [...records].sort((first, second) => (
    mode === 'minimum' ? first[field] - second[field] : second[field] - first[field]
  )).slice(0, count).map((record, index) => deepFreeze({
    rank: index + 1,
    observedAt: record.observedAt,
    value: record[field],
    field,
  }));
}

export function countThresholdEvents(inputRecords, predicate, options = {}) {
  const records = assertArray(inputRecords, 'Climate records', { nonEmpty: true }).map(normalizeRecord)
    .sort((first, second) => parseTimestamp(first.observedAt) - parseTimestamp(second.observedAt));
  const minimumLength = assertInteger(options.minimumLength ?? 1, 'Minimum event length', { minimum: 1 });
  const events = [];
  let current = [];
  records.forEach((record) => {
    if (predicate(record)) current.push(record);
    else if (current.length) {
      if (current.length >= minimumLength) events.push(current);
      current = [];
    }
  });
  if (current.length >= minimumLength) events.push(current);
  return events.map((event) => deepFreeze({
    startsAt: event[0].observedAt,
    endsAt: event.at(-1).observedAt,
    length: event.length,
    records: event,
  }));
}

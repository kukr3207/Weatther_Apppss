import { parseTimestamp, toIsoTimestamp } from './validation';
import { mean, median, sum } from './statistics';

export function sortByTime(items, selector = (item) => item.observedAt) {
  return [...(Array.isArray(items) ? items : [])].sort((first, second) => (
    parseTimestamp(selector(first), 'First timestamp')
    - parseTimestamp(selector(second), 'Second timestamp')
  ));
}

export function deduplicateByTime(items, selector = (item) => item.observedAt, resolver = (_, next) => next) {
  const indexed = new Map();
  sortByTime(items, selector).forEach((item) => {
    const timestamp = toIsoTimestamp(selector(item));
    indexed.set(timestamp, indexed.has(timestamp) ? resolver(indexed.get(timestamp), item) : item);
  });
  return [...indexed.values()];
}

export function windowSeries(items, options = {}) {
  const selector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const start = options.startsAt === undefined ? Number.NEGATIVE_INFINITY : parseTimestamp(options.startsAt);
  const end = options.endsAt === undefined ? Number.POSITIVE_INFINITY : parseTimestamp(options.endsAt);
  const includeEnd = options.includeEnd === true;
  return sortByTime(items, selector).filter((item) => {
    const timestamp = parseTimestamp(selector(item));
    return timestamp >= start && (includeEnd ? timestamp <= end : timestamp < end);
  });
}

export function nearestInTime(items, target, options = {}) {
  const selector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const targetTime = parseTimestamp(target);
  const maximumDistance = Number.isFinite(options.maximumDistanceMs)
    ? Math.max(0, options.maximumDistanceMs)
    : Number.POSITIVE_INFINITY;
  let selected = null;
  let distance = Number.POSITIVE_INFINITY;
  (Array.isArray(items) ? items : []).forEach((item) => {
    const difference = Math.abs(parseTimestamp(selector(item)) - targetTime);
    if (difference < distance) {
      selected = item;
      distance = difference;
    }
  });
  return distance <= maximumDistance ? selected : null;
}

export function groupByDuration(items, durationMinutes, options = {}) {
  const selector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const durationMs = Math.max(1, Math.trunc(durationMinutes)) * 60_000;
  const origin = options.origin === undefined ? 0 : parseTimestamp(options.origin);
  const groups = new Map();
  sortByTime(items, selector).forEach((item) => {
    const timestamp = parseTimestamp(selector(item));
    const bucketStart = origin + Math.floor((timestamp - origin) / durationMs) * durationMs;
    if (!groups.has(bucketStart)) groups.set(bucketStart, []);
    groups.get(bucketStart).push(item);
  });
  return [...groups.entries()].map(([startsAt, values]) => Object.freeze({
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + durationMs).toISOString(),
    items: Object.freeze(values),
  }));
}

export function resampleSeries(items, options = {}) {
  const intervalMinutes = Number.isFinite(options.intervalMinutes) ? options.intervalMinutes : 60;
  const valueSelector = options.valueSelector ?? ((item) => item.value);
  const reducer = options.reducer ?? 'mean';
  return groupByDuration(items, intervalMinutes, options).map((bucket) => {
    const values = bucket.items.map(valueSelector).filter(Number.isFinite);
    let value = null;
    if (reducer === 'sum') value = sum(values);
    else if (reducer === 'minimum') value = values.length ? Math.min(...values) : null;
    else if (reducer === 'maximum') value = values.length ? Math.max(...values) : null;
    else if (reducer === 'median') value = median(values);
    else if (reducer === 'first') value = values[0] ?? null;
    else if (reducer === 'last') value = values.at(-1) ?? null;
    else value = mean(values);
    return Object.freeze({ ...bucket, value, count: values.length });
  });
}

export function interpolateAt(items, target, options = {}) {
  const timeSelector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const valueSelector = options.valueSelector ?? ((item) => item.value);
  const targetTime = parseTimestamp(target);
  const sorted = sortByTime(items, timeSelector)
    .filter((item) => Number.isFinite(valueSelector(item)));
  if (!sorted.length) return null;
  const exact = sorted.find((item) => parseTimestamp(timeSelector(item)) === targetTime);
  if (exact) return valueSelector(exact);
  const previous = [...sorted].reverse().find((item) => parseTimestamp(timeSelector(item)) < targetTime);
  const next = sorted.find((item) => parseTimestamp(timeSelector(item)) > targetTime);
  if (!previous || !next) return options.extrapolate ? valueSelector(previous ?? next) : null;
  const previousTime = parseTimestamp(timeSelector(previous));
  const nextTime = parseTimestamp(timeSelector(next));
  const fraction = (targetTime - previousTime) / (nextTime - previousTime);
  return valueSelector(previous) + (valueSelector(next) - valueSelector(previous)) * fraction;
}

export function integrateSeries(items, options = {}) {
  const timeSelector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const valueSelector = options.valueSelector ?? ((item) => item.value);
  const sorted = sortByTime(items, timeSelector).filter((item) => Number.isFinite(valueSelector(item)));
  let valueMilliseconds = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const duration = parseTimestamp(timeSelector(current)) - parseTimestamp(timeSelector(previous));
    valueMilliseconds += duration * (valueSelector(previous) + valueSelector(current)) / 2;
  }
  const unit = options.unit ?? 'hours';
  if (unit === 'milliseconds') return valueMilliseconds;
  if (unit === 'seconds') return valueMilliseconds / 1000;
  if (unit === 'minutes') return valueMilliseconds / 60_000;
  if (unit === 'days') return valueMilliseconds / 86_400_000;
  return valueMilliseconds / 3_600_000;
}

export function findGaps(items, options = {}) {
  const selector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const expectedMinutes = Number.isFinite(options.expectedMinutes) ? options.expectedMinutes : 60;
  const tolerance = Number.isFinite(options.tolerance) ? Math.max(1, options.tolerance) : 1.5;
  const threshold = expectedMinutes * 60_000 * tolerance;
  const sorted = sortByTime(items, selector);
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = parseTimestamp(selector(sorted[index - 1]));
    const current = parseTimestamp(selector(sorted[index]));
    if (current - previous > threshold) {
      gaps.push(Object.freeze({
        after: new Date(previous).toISOString(),
        before: new Date(current).toISOString(),
        missingMinutes: (current - previous) / 60_000 - expectedMinutes,
      }));
    }
  }
  return gaps;
}

export function alignSeries(series, options = {}) {
  const targetTimes = [...new Set(
    (Array.isArray(series) ? series : [])
      .flatMap((entry) => (Array.isArray(entry?.items) ? entry.items : []))
      .map((item) => toIsoTimestamp((options.timeSelector ?? ((value) => value.observedAt ?? value.forecastAt))(item))),
  )].sort();
  return targetTimes.map((timestamp) => Object.freeze({
    timestamp,
    values: Object.freeze((Array.isArray(series) ? series : []).map((entry) => interpolateAt(entry.items, timestamp, {
      ...options,
      extrapolate: false,
    }))),
  }));
}

export function splitOnGaps(items, options = {}) {
  const selector = options.timeSelector ?? ((item) => item.observedAt ?? item.forecastAt);
  const maximumGapMinutes = Number.isFinite(options.maximumGapMinutes) ? options.maximumGapMinutes : 180;
  const sorted = sortByTime(items, selector);
  const segments = [];
  let current = [];
  sorted.forEach((item) => {
    if (current.length) {
      const gap = parseTimestamp(selector(item)) - parseTimestamp(selector(current.at(-1)));
      if (gap > maximumGapMinutes * 60_000) {
        segments.push(current);
        current = [];
      }
    }
    current.push(item);
  });
  if (current.length) segments.push(current);
  return segments;
}

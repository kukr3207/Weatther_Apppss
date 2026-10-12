import { describe, expect, it } from 'vitest';
import {
  WeatherOperationsError,
  assertArray,
  assertBoolean,
  assertChronologicalWindow,
  assertEnum,
  assertFiniteNumber,
  assertInteger,
  assertObject,
  assertString,
  clamp,
  deepFreeze,
  normalizeCoordinates,
  normalizeLocation,
  optionalFiniteNumber,
  optionalString,
  parseTimestamp,
  round,
  stableStringify,
  toIsoTimestamp,
  uniqueBy,
} from './validation';
import {
  exponentialMovingAverage,
  finiteNumbers,
  histogram,
  linearRegression,
  maximum,
  mean,
  meanAbsoluteError,
  median,
  minimum,
  movingAverage,
  normalizeWeights,
  quantile,
  rootMeanSquareError,
  scoreBand,
  standardDeviation,
  sum,
  summarizeNumbers,
  variance,
  weightedMean,
  weightedMedian,
} from './statistics';
import {
  alignSeries,
  deduplicateByTime,
  findGaps,
  groupByDuration,
  integrateSeries,
  interpolateAt,
  nearestInTime,
  resampleSeries,
  sortByTime,
  splitOnGaps,
  windowSeries,
} from './timeSeries';
import {
  boundsForLocations,
  cardinalDirection,
  closestLocation,
  containsCoordinate,
  destinationPoint,
  estimateTravelTimes,
  haversineDistance,
  initialBearing,
  interpolateGreatCircle,
  normalizeLongitude,
  routeDistance,
  sampleRoute,
} from './geo';

describe('operations validation', () => {
  it('accepts plain objects', () => {
    expect(assertObject({ value: 1 })).toEqual({ value: 1 });
  });

  it('rejects arrays as plain objects', () => {
    expect(() => assertObject([])).toThrow(WeatherOperationsError);
  });

  it('checks non-empty arrays', () => {
    expect(() => assertArray([], 'Values', { nonEmpty: true })).toThrow('must not be empty');
  });

  it('checks array capacities', () => {
    expect(() => assertArray([1, 2], 'Values', { maximum: 1 })).toThrow('at most 1');
  });

  it('trims text by default', () => {
    expect(assertString('  London  ')).toBe('London');
  });

  it('can retain text whitespace', () => {
    expect(assertString(' x ', 'Value', { trim: false })).toBe(' x ');
  });

  it('allows optional empty text', () => {
    expect(optionalString('', 'Note')).toBeNull();
  });

  it('checks text patterns', () => {
    expect(() => assertString('bad id', 'Id', { pattern: /^\w+$/ })).toThrow('invalid format');
  });

  it('checks finite number ranges', () => {
    expect(assertFiniteNumber(5, 'Value', { minimum: 0, maximum: 10 })).toBe(5);
  });

  it('coerces finite numbers when requested', () => {
    expect(assertFiniteNumber('5', 'Value', { coerce: true })).toBe(5);
  });

  it('returns null for optional numbers', () => {
    expect(optionalFiniteNumber(undefined, 'Value')).toBeNull();
  });

  it('requires integer values', () => {
    expect(() => assertInteger(1.5)).toThrow('integer');
  });

  it('requires boolean values', () => {
    expect(assertBoolean(false)).toBe(false);
    expect(() => assertBoolean(0)).toThrow('true or false');
  });

  it('requires enum membership', () => {
    expect(assertEnum('metric', ['metric', 'imperial'])).toBe('metric');
    expect(() => assertEnum('kelvin', ['metric'])).toThrow('must be one of');
  });

  it('parses dates and timestamps', () => {
    expect(parseTimestamp('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(toIsoTimestamp('2026-01-01')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('validates chronological windows', () => {
    const value = assertChronologicalWindow('2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z');
    expect(value.durationMinutes).toBe(60);
  });

  it('rejects reversed windows', () => {
    expect(() => assertChronologicalWindow('2026-01-02', '2026-01-01')).toThrow('must end after');
  });

  it('normalizes coordinates', () => {
    expect(normalizeCoordinates({ latitude: 12, longitude: -20 })).toEqual({ latitude: 12, longitude: -20 });
  });

  it('rejects impossible coordinates', () => {
    expect(() => normalizeCoordinates({ latitude: 100, longitude: 0 })).toThrow('no more than 90');
  });

  it('normalizes locations and derives an id', () => {
    expect(normalizeLocation({ name: 'Town', latitude: 1, longitude: 2 }).id).toBe('1,2');
  });

  it('selects unique items in order', () => {
    expect(uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => item.id)).toHaveLength(2);
  });

  it('clamps values', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it('rounds values', () => {
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(null)).toBeNull();
  });

  it('produces stable object serialization', () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('deep freezes nested objects', () => {
    const value = deepFreeze({ child: { value: 1 }, list: [1] });
    expect(Object.isFrozen(value.child)).toBe(true);
    expect(Object.isFrozen(value.list)).toBe(true);
  });
});

describe('operations statistics', () => {
  const values = [1, 2, 3, 4, 5];

  it('filters finite numbers', () => {
    expect(finiteNumbers([1, null, Infinity, 2])).toEqual([1, 2]);
  });

  it('calculates sums and means', () => {
    expect(sum(values)).toBe(15);
    expect(mean(values)).toBe(3);
  });

  it('calculates medians for odd and even values', () => {
    expect(median(values)).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('interpolates quantiles', () => {
    expect(quantile(values, 0.25)).toBe(2);
    expect(quantile(values, 0.9)).toBeCloseTo(4.6);
  });

  it('calculates bounds', () => {
    expect(minimum(values)).toBe(1);
    expect(maximum(values)).toBe(5);
  });

  it('calculates population variance', () => {
    expect(variance(values)).toBe(2);
    expect(standardDeviation(values)).toBeCloseTo(Math.sqrt(2));
  });

  it('calculates sample variance', () => {
    expect(variance(values, { sample: true })).toBe(2.5);
  });

  it('calculates mean absolute error', () => {
    expect(meanAbsoluteError([1, 2], [2, 4])).toBe(1.5);
  });

  it('calculates root mean square error', () => {
    expect(rootMeanSquareError([1, 2], [2, 4])).toBeCloseTo(Math.sqrt(2.5));
  });

  it('calculates weighted means', () => {
    expect(weightedMean([{ value: 10, weight: 1 }, { value: 20, weight: 3 }])).toBe(17.5);
  });

  it('calculates weighted medians', () => {
    expect(weightedMedian([{ value: 10, weight: 1 }, { value: 20, weight: 3 }])).toBe(20);
  });

  it('fits linear trends', () => {
    const result = linearRegression([{ x: 0, y: 2 }, { x: 1, y: 4 }, { x: 2, y: 6 }]);
    expect(result.slope).toBe(2);
    expect(result.intercept).toBe(2);
    expect(result.correlation).toBe(1);
  });

  it('calculates exponential moving averages', () => {
    expect(exponentialMovingAverage([10, 20, 30], 0.5)).toEqual([10, 15, 22.5]);
  });

  it('calculates moving averages', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });

  it('builds histograms', () => {
    expect(histogram([1, 2, 5, 8], [3, 6]).map((bin) => bin.count)).toEqual([2, 1, 1]);
  });

  it('normalizes weights', () => {
    expect(normalizeWeights([{ weight: 1 }, { weight: 3 }])).toEqual([0.25, 0.75]);
  });

  it('selects score bands', () => {
    expect(scoreBand(75, [{ minimum: 0, id: 'low' }, { minimum: 70, id: 'high' }]).id).toBe('high');
  });

  it('summarizes numeric collections', () => {
    const result = summarizeNumbers(values);
    expect(result.count).toBe(5);
    expect(result.mean).toBe(3);
    expect(result.median).toBe(3);
  });
});

describe('time-series operations', () => {
  const series = [
    { observedAt: '2026-01-01T02:00:00Z', value: 20 },
    { observedAt: '2026-01-01T00:00:00Z', value: 0 },
    { observedAt: '2026-01-01T01:00:00Z', value: 10 },
  ];

  it('sorts values chronologically', () => {
    expect(sortByTime(series).map((item) => item.value)).toEqual([0, 10, 20]);
  });

  it('deduplicates timestamps', () => {
    const duplicate = [...series, { observedAt: series[0].observedAt, value: 22 }];
    expect(deduplicateByTime(duplicate).at(-1).value).toBe(22);
  });

  it('selects half-open windows', () => {
    const result = windowSeries(series, { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-01T02:00:00Z' });
    expect(result).toHaveLength(2);
  });

  it('finds nearest points', () => {
    expect(nearestInTime(series, '2026-01-01T01:10:00Z').value).toBe(10);
  });

  it('groups points by duration', () => {
    expect(groupByDuration(series, 120)).toHaveLength(2);
  });

  it('resamples values using a mean', () => {
    expect(resampleSeries(series, { intervalMinutes: 120 })[0].value).toBe(5);
  });

  it('linearly interpolates values', () => {
    expect(interpolateAt(series, '2026-01-01T00:30:00Z')).toBe(5);
  });

  it('integrates by trapezoids', () => {
    expect(integrateSeries(series)).toBe(20);
  });

  it('finds missing time ranges', () => {
    expect(findGaps([series[1], series[0]], { expectedMinutes: 60 })).toHaveLength(1);
  });

  it('aligns separate series', () => {
    const result = alignSeries([{ items: series }, { items: series.map((item) => ({ ...item, value: item.value * 2 })) }]);
    expect(result[1].values).toEqual([10, 20]);
  });

  it('splits on large gaps', () => {
    expect(splitOnGaps([series[1], series[0]], { maximumGapMinutes: 90 })).toHaveLength(2);
  });
});

describe('geospatial operations', () => {
  const london = { latitude: 51.5074, longitude: -0.1278 };
  const paris = { latitude: 48.8566, longitude: 2.3522 };

  it('normalizes longitudes', () => {
    expect(normalizeLongitude(190)).toBe(-170);
  });

  it('calculates great-circle distances', () => {
    expect(haversineDistance(london, paris)).toBeGreaterThan(340);
    expect(haversineDistance(london, paris)).toBeLessThan(350);
  });

  it('calculates initial bearings', () => {
    expect(initialBearing(london, paris)).toBeGreaterThan(140);
  });

  it('calculates destination points', () => {
    const point = destinationPoint(london, 100, 90);
    expect(point.longitude).toBeGreaterThan(london.longitude);
  });

  it('interpolates great-circle points', () => {
    const midpoint = interpolateGreatCircle(london, paris, 0.5);
    expect(haversineDistance(london, midpoint)).toBeCloseTo(haversineDistance(midpoint, paris), 0);
  });

  it('samples routes at regular spacing', () => {
    expect(sampleRoute([london, paris], { spacingKm: 50 }).length).toBeGreaterThan(6);
  });

  it('adds route segment distances', () => {
    expect(routeDistance([london, paris])).toBeCloseTo(haversineDistance(london, paris), 6);
  });

  it('creates coordinate bounds', () => {
    const bounds = boundsForLocations([london, paris]);
    expect(bounds.south).toBe(paris.latitude);
    expect(bounds.north).toBe(london.latitude);
  });

  it('checks points inside bounds', () => {
    const bounds = boundsForLocations([london, paris], { paddingDegrees: 1 });
    expect(containsCoordinate(bounds, london)).toBe(true);
  });

  it('finds the closest location', () => {
    const result = closestLocation(london, [paris, { latitude: 52, longitude: 0 }]);
    expect(result.location.latitude).toBe(52);
  });

  it('formats cardinal directions', () => {
    expect(cardinalDirection(91)).toBe('E');
    expect(cardinalDirection(225, { long: true })).toBe('southwest');
  });

  it('estimates route arrival times', () => {
    const result = estimateTravelTimes([london, paris], { startsAt: '2026-01-01T00:00:00Z', speedKph: 100 });
    expect(Date.parse(result[1].estimatedAt)).toBeGreaterThan(Date.parse(result[0].estimatedAt));
  });
});

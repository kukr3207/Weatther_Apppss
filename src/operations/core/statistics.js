import { assertArray, assertFiniteNumber, clamp, round } from './validation';

export function finiteNumbers(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(Number.isFinite);
}

export function sum(values) {
  return finiteNumbers(values).reduce((total, value) => total + value, 0);
}

export function mean(values) {
  const numbers = finiteNumbers(values);
  return numbers.length ? sum(numbers) / numbers.length : null;
}

export function median(values) {
  const numbers = finiteNumbers(values).sort((first, second) => first - second);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function quantile(values, probability) {
  const numbers = finiteNumbers(values).sort((first, second) => first - second);
  if (!numbers.length) return null;
  const p = assertFiniteNumber(probability, 'Probability', { minimum: 0, maximum: 1 });
  if (numbers.length === 1) return numbers[0];
  const position = (numbers.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return numbers[lower];
  const fraction = position - lower;
  return numbers[lower] + (numbers[upper] - numbers[lower]) * fraction;
}

export function minimum(values) {
  const numbers = finiteNumbers(values);
  return numbers.length ? Math.min(...numbers) : null;
}

export function maximum(values) {
  const numbers = finiteNumbers(values);
  return numbers.length ? Math.max(...numbers) : null;
}

export function variance(values, options = {}) {
  const numbers = finiteNumbers(values);
  const sample = options.sample === true;
  if (!numbers.length || (sample && numbers.length < 2)) return null;
  const center = mean(numbers);
  const divisor = sample ? numbers.length - 1 : numbers.length;
  return numbers.reduce((total, value) => total + ((value - center) ** 2), 0) / divisor;
}

export function standardDeviation(values, options = {}) {
  const calculated = variance(values, options);
  return calculated === null ? null : Math.sqrt(calculated);
}

export function meanAbsoluteError(actual, predicted) {
  assertArray(actual, 'Actual values');
  assertArray(predicted, 'Predicted values');
  if (actual.length !== predicted.length) return null;
  const errors = actual
    .map((value, index) => (Number.isFinite(value) && Number.isFinite(predicted[index])
      ? Math.abs(value - predicted[index])
      : null))
    .filter(Number.isFinite);
  return mean(errors);
}

export function rootMeanSquareError(actual, predicted) {
  assertArray(actual, 'Actual values');
  assertArray(predicted, 'Predicted values');
  if (actual.length !== predicted.length) return null;
  const squared = actual
    .map((value, index) => (Number.isFinite(value) && Number.isFinite(predicted[index])
      ? (value - predicted[index]) ** 2
      : null))
    .filter(Number.isFinite);
  const average = mean(squared);
  return average === null ? null : Math.sqrt(average);
}

export function weightedMean(entries, valueSelector = (entry) => entry.value, weightSelector = (entry) => entry.weight) {
  if (!Array.isArray(entries)) return null;
  let numerator = 0;
  let denominator = 0;
  entries.forEach((entry, index) => {
    const value = valueSelector(entry, index);
    const weight = weightSelector(entry, index);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) return;
    numerator += value * weight;
    denominator += weight;
  });
  return denominator > 0 ? numerator / denominator : null;
}

export function weightedMedian(entries, valueSelector = (entry) => entry.value, weightSelector = (entry) => entry.weight) {
  if (!Array.isArray(entries)) return null;
  const selected = entries
    .map((entry, index) => ({
      value: valueSelector(entry, index),
      weight: weightSelector(entry, index),
    }))
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((first, second) => first.value - second.value);
  if (!selected.length) return null;
  const midpoint = sum(selected.map((entry) => entry.weight)) / 2;
  let cumulative = 0;
  for (const entry of selected) {
    cumulative += entry.weight;
    if (cumulative >= midpoint) return entry.value;
  }
  return selected.at(-1).value;
}

export function linearRegression(points) {
  const selected = Array.isArray(points)
    ? points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    : [];
  if (selected.length < 2) {
    return Object.freeze({ slope: null, intercept: null, correlation: null, count: selected.length });
  }
  const xMean = mean(selected.map((point) => point.x));
  const yMean = mean(selected.map((point) => point.y));
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  selected.forEach((point) => {
    const xDifference = point.x - xMean;
    const yDifference = point.y - yMean;
    numerator += xDifference * yDifference;
    xDenominator += xDifference ** 2;
    yDenominator += yDifference ** 2;
  });
  const slope = xDenominator === 0 ? 0 : numerator / xDenominator;
  const intercept = yMean - slope * xMean;
  const correlation = xDenominator === 0 || yDenominator === 0
    ? 0
    : numerator / Math.sqrt(xDenominator * yDenominator);
  return Object.freeze({ slope, intercept, correlation, count: selected.length });
}

export function exponentialMovingAverage(values, alpha = 0.35) {
  const smoothing = assertFiniteNumber(alpha, 'Smoothing factor', { minimum: 0.000001, maximum: 1 });
  let previous = null;
  return (Array.isArray(values) ? values : []).map((value) => {
    if (!Number.isFinite(value)) return previous;
    previous = previous === null ? value : smoothing * value + (1 - smoothing) * previous;
    return previous;
  });
}

export function movingAverage(values, windowSize) {
  const size = Math.max(1, Math.trunc(windowSize));
  const queue = [];
  let running = 0;
  return (Array.isArray(values) ? values : []).map((value) => {
    if (!Number.isFinite(value)) return null;
    queue.push(value);
    running += value;
    if (queue.length > size) running -= queue.shift();
    return running / queue.length;
  });
}

export function histogram(values, boundaries) {
  const bins = [...finiteNumbers(boundaries)].sort((first, second) => first - second);
  const counts = Array.from({ length: bins.length + 1 }, () => 0);
  finiteNumbers(values).forEach((value) => {
    const index = bins.findIndex((boundary) => value < boundary);
    counts[index === -1 ? bins.length : index] += 1;
  });
  return counts.map((count, index) => Object.freeze({
    minimum: index === 0 ? null : bins[index - 1],
    maximum: index === bins.length ? null : bins[index],
    count,
  }));
}

export function normalizeWeights(entries, weightSelector = (entry) => entry.weight) {
  if (!Array.isArray(entries)) return [];
  const weights = entries.map((entry, index) => {
    const weight = weightSelector(entry, index);
    return Number.isFinite(weight) && weight > 0 ? weight : 0;
  });
  const total = sum(weights);
  if (total === 0) return entries.map(() => 0);
  return weights.map((weight) => weight / total);
}

export function scoreBand(score, bands) {
  const normalized = clamp(score, 0, 100);
  const sorted = [...(Array.isArray(bands) ? bands : [])]
    .filter((band) => Number.isFinite(band?.minimum))
    .sort((first, second) => second.minimum - first.minimum);
  return sorted.find((band) => normalized >= band.minimum) ?? null;
}

export function summarizeNumbers(values, options = {}) {
  const numbers = finiteNumbers(values);
  return Object.freeze({
    count: numbers.length,
    minimum: round(minimum(numbers), options.digits ?? 2),
    maximum: round(maximum(numbers), options.digits ?? 2),
    mean: round(mean(numbers), options.digits ?? 2),
    median: round(median(numbers), options.digits ?? 2),
    p10: round(quantile(numbers, 0.1), options.digits ?? 2),
    p90: round(quantile(numbers, 0.9), options.digits ?? 2),
    standardDeviation: round(standardDeviation(numbers), options.digits ?? 2),
  });
}

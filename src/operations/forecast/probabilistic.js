import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import { maximum, mean, minimum, quantile, sum } from '../core/statistics';

function normalizeProbability(value, label) {
  return assertFiniteNumber(value, label, { minimum: 0, maximum: 1 });
}

function normalizeBinaryForecast(input, index) {
  assertObject(input, `Probability forecast ${index + 1}`);
  const validAt = input.validAt ?? input.forecastAt ?? input.observedAt ?? null;
  return deepFreeze({
    id: String(input.id ?? `forecast-${index + 1}`),
    probability: normalizeProbability(input.probability, `Forecast ${index + 1} probability`),
    observed: input.observed === true || input.outcome === 1 ? 1 : 0,
    validAt: validAt === null ? null : new Date(parseTimestamp(validAt)).toISOString(),
    leadHours: Number.isFinite(input.leadHours) ? Math.max(0, input.leadHours) : null,
    providerId: input.providerId ? String(input.providerId) : null,
  });
}

function probabilityBin(probability, binCount) {
  return Math.min(binCount - 1, Math.floor(probability * binCount));
}

export function reliabilityDiagram(inputForecasts, options = {}) {
  const forecasts = assertArray(inputForecasts, 'Probability forecasts', { nonEmpty: true })
    .map(normalizeBinaryForecast);
  const binCount = Math.trunc(assertFiniteNumber(options.binCount ?? 10, 'Reliability bin count', {
    minimum: 2,
    maximum: 100,
  }));
  const minimumSamples = Math.trunc(assertFiniteNumber(options.minimumSamples ?? 1, 'Minimum bin samples', {
    minimum: 1,
  }));
  const groups = Array.from({ length: binCount }, () => []);
  forecasts.forEach((forecast) => groups[probabilityBin(forecast.probability, binCount)].push(forecast));
  const bins = groups.map((entries, index) => {
    const lower = index / binCount;
    const upper = (index + 1) / binCount;
    const forecastProbability = mean(entries.map((entry) => entry.probability));
    const observedFrequency = mean(entries.map((entry) => entry.observed));
    return deepFreeze({
      index,
      lower: round(lower, 3),
      upper: round(upper, 3),
      midpoint: round((lower + upper) / 2, 3),
      count: entries.length,
      forecastProbability: round(forecastProbability, 4),
      observedFrequency: round(observedFrequency, 4),
      calibrationError: entries.length
        ? round(Math.abs(forecastProbability - observedFrequency), 4)
        : null,
      usable: entries.length >= minimumSamples,
    });
  });
  const populated = bins.filter((bin) => bin.count > 0);
  const expectedCalibrationError = sum(populated.map(
    (bin) => bin.calibrationError * bin.count / forecasts.length,
  ));
  const maximumCalibrationError = maximum(populated.map((bin) => bin.calibrationError));
  return deepFreeze({
    sampleCount: forecasts.length,
    binCount,
    bins,
    expectedCalibrationError: round(expectedCalibrationError, 4),
    maximumCalibrationError: round(maximumCalibrationError, 4),
    eventFrequency: round(mean(forecasts.map((entry) => entry.observed)), 4),
  });
}

export function brierScore(inputForecasts, options = {}) {
  const forecasts = assertArray(inputForecasts, 'Probability forecasts', { nonEmpty: true })
    .map(normalizeBinaryForecast);
  const score = mean(forecasts.map((entry) => (entry.probability - entry.observed) ** 2));
  const climatology = mean(forecasts.map((entry) => entry.observed));
  const referenceScore = mean(forecasts.map((entry) => (climatology - entry.observed) ** 2));
  const reliability = reliabilityDiagram(forecasts, options);
  const reliabilityComponent = sum(reliability.bins.filter((bin) => bin.count).map((bin) => (
    bin.count / forecasts.length * (bin.forecastProbability - bin.observedFrequency) ** 2
  )));
  const resolution = sum(reliability.bins.filter((bin) => bin.count).map((bin) => (
    bin.count / forecasts.length * (bin.observedFrequency - climatology) ** 2
  )));
  const uncertainty = climatology * (1 - climatology);
  return deepFreeze({
    score: round(score, 5),
    climatology: round(climatology, 5),
    referenceScore: round(referenceScore, 5),
    skillScore: referenceScore > 0 ? round(1 - score / referenceScore, 5) : null,
    reliability: round(reliabilityComponent, 5),
    resolution: round(resolution, 5),
    uncertainty: round(uncertainty, 5),
    sampleCount: forecasts.length,
  });
}

function confusion(forecasts, threshold) {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  forecasts.forEach((forecast) => {
    const predicted = forecast.probability >= threshold;
    if (predicted && forecast.observed) truePositive += 1;
    else if (predicted) falsePositive += 1;
    else if (forecast.observed) falseNegative += 1;
    else trueNegative += 1;
  });
  const hitRate = truePositive + falseNegative
    ? truePositive / (truePositive + falseNegative)
    : null;
  const falseAlarmRate = falsePositive + trueNegative
    ? falsePositive / (falsePositive + trueNegative)
    : null;
  return deepFreeze({
    threshold: round(threshold, 4),
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    hitRate: round(hitRate, 5),
    falseAlarmRate: round(falseAlarmRate, 5),
    precision: truePositive + falsePositive ? round(truePositive / (truePositive + falsePositive), 5) : null,
    accuracy: round((truePositive + trueNegative) / forecasts.length, 5),
  });
}

export function receiverOperatingCurve(inputForecasts, options = {}) {
  const forecasts = assertArray(inputForecasts, 'Probability forecasts', { nonEmpty: true })
    .map(normalizeBinaryForecast);
  const thresholds = options.thresholds
    ? assertArray(options.thresholds, 'ROC thresholds', { nonEmpty: true }).map((value) => normalizeProbability(value, 'ROC threshold'))
    : [...new Set([1, ...forecasts.map((entry) => entry.probability), 0])];
  const points = thresholds.sort((first, second) => second - first)
    .map((threshold) => confusion(forecasts, threshold))
    .filter((point) => point.hitRate !== null && point.falseAlarmRate !== null)
    .sort((first, second) => first.falseAlarmRate - second.falseAlarmRate || first.hitRate - second.hitRate);
  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const width = points[index].falseAlarmRate - points[index - 1].falseAlarmRate;
    area += width * (points[index].hitRate + points[index - 1].hitRate) / 2;
  }
  const best = [...points].sort((first, second) => (
    (second.hitRate - second.falseAlarmRate) - (first.hitRate - first.falseAlarmRate)
    || second.accuracy - first.accuracy
  ))[0] ?? null;
  return deepFreeze({
    points,
    areaUnderCurve: round(area, 5),
    bestThreshold: best?.threshold ?? null,
    bestYoudenIndex: best ? round(best.hitRate - best.falseAlarmRate, 5) : null,
    sampleCount: forecasts.length,
  });
}

export function quantileScore(forecastsInput, observationsInput, quantileLevel) {
  const forecasts = assertArray(forecastsInput, 'Quantile forecasts', { nonEmpty: true });
  const observations = assertArray(observationsInput, 'Quantile observations', { nonEmpty: true });
  if (forecasts.length !== observations.length) throw new TypeError('Quantile forecasts and observations must have equal length.');
  const level = normalizeProbability(quantileLevel, 'Quantile level');
  const losses = forecasts.map((forecast, index) => {
    const predicted = assertFiniteNumber(forecast, `Quantile forecast ${index + 1}`);
    const observed = assertFiniteNumber(observations[index], `Observation ${index + 1}`);
    const error = observed - predicted;
    return Math.max(level * error, (level - 1) * error);
  });
  return deepFreeze({
    quantile: level,
    score: round(mean(losses), 5),
    losses: losses.map((loss) => round(loss, 5)),
    sampleCount: losses.length,
  });
}

export function continuousRankedProbabilityScore(ensemblesInput, observationsInput) {
  const ensembles = assertArray(ensemblesInput, 'Forecast ensembles', { nonEmpty: true });
  const observations = assertArray(observationsInput, 'Ensemble observations', { nonEmpty: true });
  if (ensembles.length !== observations.length) throw new TypeError('Ensembles and observations must have equal length.');
  const scores = ensembles.map((membersInput, index) => {
    const members = assertArray(membersInput, `Ensemble ${index + 1}`, { nonEmpty: true })
      .map((member, memberIndex) => assertFiniteNumber(member, `Ensemble ${index + 1} member ${memberIndex + 1}`));
    const observation = assertFiniteNumber(observations[index], `Observation ${index + 1}`);
    const absoluteError = mean(members.map((member) => Math.abs(member - observation)));
    let pairDifference = 0;
    members.forEach((first) => members.forEach((second) => { pairDifference += Math.abs(first - second); }));
    const dispersion = pairDifference / (2 * members.length ** 2);
    return absoluteError - dispersion;
  });
  return deepFreeze({
    score: round(mean(scores), 5),
    scores: scores.map((score) => round(score, 5)),
    sampleCount: scores.length,
  });
}

export function predictionIntervalCoverage(intervalsInput, observationsInput, options = {}) {
  const intervals = assertArray(intervalsInput, 'Prediction intervals', { nonEmpty: true });
  const observations = assertArray(observationsInput, 'Interval observations', { nonEmpty: true });
  if (intervals.length !== observations.length) throw new TypeError('Prediction intervals and observations must have equal length.');
  const expectedCoverage = normalizeProbability(options.expectedCoverage ?? 0.8, 'Expected interval coverage');
  const results = intervals.map((interval, index) => {
    assertObject(interval, `Prediction interval ${index + 1}`);
    const lower = assertFiniteNumber(interval.lower, `Interval ${index + 1} lower`);
    const upper = assertFiniteNumber(interval.upper, `Interval ${index + 1} upper`);
    if (upper < lower) throw new TypeError(`Prediction interval ${index + 1} has reversed bounds.`);
    const observation = assertFiniteNumber(observations[index], `Observation ${index + 1}`);
    return deepFreeze({
      lower,
      upper,
      observation,
      covered: observation >= lower && observation <= upper,
      width: upper - lower,
      missDistance: observation < lower ? lower - observation : observation > upper ? observation - upper : 0,
    });
  });
  const actualCoverage = mean(results.map((result) => Number(result.covered)));
  return deepFreeze({
    expectedCoverage,
    actualCoverage: round(actualCoverage, 5),
    coverageBias: round(actualCoverage - expectedCoverage, 5),
    averageWidth: round(mean(results.map((result) => result.width)), 5),
    averageMissDistance: round(mean(results.filter((result) => !result.covered).map((result) => result.missDistance)) ?? 0, 5),
    results,
  });
}

export function rankHistogram(ensemblesInput, observationsInput) {
  const ensembles = assertArray(ensemblesInput, 'Rank ensembles', { nonEmpty: true });
  const observations = assertArray(observationsInput, 'Rank observations', { nonEmpty: true });
  if (ensembles.length !== observations.length) throw new TypeError('Rank ensembles and observations must have equal length.');
  const memberCount = assertArray(ensembles[0], 'First ensemble', { nonEmpty: true }).length;
  const counts = Array.from({ length: memberCount + 1 }, () => 0);
  ensembles.forEach((membersInput, index) => {
    const members = assertArray(membersInput, `Rank ensemble ${index + 1}`, { nonEmpty: true })
      .map((member) => assertFiniteNumber(member, 'Ensemble member'));
    if (members.length !== memberCount) throw new TypeError('Every rank ensemble must contain the same number of members.');
    const observation = assertFiniteNumber(observations[index], `Rank observation ${index + 1}`);
    const below = members.filter((member) => member < observation).length;
    const equal = members.filter((member) => member === observation).length;
    const rank = Math.min(memberCount, below + Math.floor(equal / 2));
    counts[rank] += 1;
  });
  const expected = ensembles.length / counts.length;
  const chiSquare = expected > 0 ? sum(counts.map((count) => (count - expected) ** 2 / expected)) : null;
  return deepFreeze({
    memberCount,
    counts,
    expectedPerBin: round(expected, 4),
    chiSquare: round(chiSquare, 4),
    shape: counts[0] + counts.at(-1) > counts.slice(1, -1).reduce((total, count) => total + count, 0)
      ? 'underdispersed'
      : counts[0] + counts.at(-1) < expected ? 'overdispersed' : 'balanced',
  });
}

export function ensembleSpreadSkill(ensemblesInput, observationsInput) {
  const ensembles = assertArray(ensemblesInput, 'Spread ensembles', { nonEmpty: true });
  const observations = assertArray(observationsInput, 'Spread observations', { nonEmpty: true });
  if (ensembles.length !== observations.length) throw new TypeError('Spread ensembles and observations must have equal length.');
  const cases = ensembles.map((membersInput, index) => {
    const members = assertArray(membersInput, `Spread ensemble ${index + 1}`, { nonEmpty: true })
      .map((member) => assertFiniteNumber(member, 'Ensemble member'));
    const observation = assertFiniteNumber(observations[index], `Spread observation ${index + 1}`);
    const center = mean(members);
    const spread = Math.sqrt(mean(members.map((member) => (member - center) ** 2)));
    return deepFreeze({
      mean: round(center, 5),
      spread: round(spread, 5),
      error: round(center - observation, 5),
      absoluteError: round(Math.abs(center - observation), 5),
    });
  });
  const rootMeanSquareError = Math.sqrt(mean(cases.map((entry) => entry.error ** 2)));
  const averageSpread = mean(cases.map((entry) => entry.spread));
  return deepFreeze({
    averageSpread: round(averageSpread, 5),
    rootMeanSquareError: round(rootMeanSquareError, 5),
    spreadSkillRatio: rootMeanSquareError > 0 ? round(averageSpread / rootMeanSquareError, 5) : null,
    cases,
  });
}

export function buildProbabilityCalibration(inputForecasts, options = {}) {
  const diagram = reliabilityDiagram(inputForecasts, options);
  const populated = diagram.bins.filter((bin) => bin.count >= (options.minimumSamples ?? 1));
  if (!populated.length) throw new TypeError('Probability calibration requires at least one populated bin.');
  const points = populated.map((bin) => ({
    input: bin.forecastProbability,
    output: bin.observedFrequency,
    count: bin.count,
  })).sort((first, second) => first.input - second.input);
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].output < points[index - 1].output) points[index].output = points[index - 1].output;
  }
  return deepFreeze({
    method: 'binned_monotonic',
    points: points.map((point) => deepFreeze({
      input: round(point.input, 5),
      output: round(point.output, 5),
      count: point.count,
    })),
    sourceSampleCount: diagram.sampleCount,
    sourceCalibrationError: diagram.expectedCalibrationError,
  });
}

export function applyProbabilityCalibration(probabilityInput, calibration) {
  const probability = normalizeProbability(probabilityInput, 'Probability to calibrate');
  const points = assertArray(calibration.points, 'Probability calibration points', { nonEmpty: true });
  if (probability <= points[0].input) return points[0].output;
  if (probability >= points.at(-1).input) return points.at(-1).output;
  const upperIndex = points.findIndex((point) => point.input >= probability);
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const distance = upper.input - lower.input;
  const fraction = distance > 0 ? (probability - lower.input) / distance : 0;
  return round(lower.output + (upper.output - lower.output) * fraction, 5);
}

export function probabilisticForecastSummary(input) {
  assertObject(input, 'Probabilistic forecast summary input');
  const binary = input.binaryForecasts?.length
    ? brierScore(input.binaryForecasts, input.options)
    : null;
  const roc = input.binaryForecasts?.length
    ? receiverOperatingCurve(input.binaryForecasts, input.options)
    : null;
  const continuous = input.ensembles?.length && input.observations?.length
    ? continuousRankedProbabilityScore(input.ensembles, input.observations)
    : null;
  const spreadSkill = input.ensembles?.length && input.observations?.length
    ? ensembleSpreadSkill(input.ensembles, input.observations)
    : null;
  const warnings = [];
  if (binary?.skillScore !== null && binary.skillScore < 0) warnings.push('Probabilities underperform climatology.');
  if (roc?.areaUnderCurve !== null && roc.areaUnderCurve < 0.6) warnings.push('Event discrimination is weak.');
  if (spreadSkill?.spreadSkillRatio !== null && spreadSkill.spreadSkillRatio < 0.7) warnings.push('The ensemble is underdispersed.');
  if (spreadSkill?.spreadSkillRatio !== null && spreadSkill.spreadSkillRatio > 1.4) warnings.push('The ensemble is overdispersed.');
  return deepFreeze({
    binary,
    roc,
    continuous,
    spreadSkill,
    warnings,
    quality: warnings.length === 0 ? 'good' : warnings.length === 1 ? 'review' : 'poor',
  });
}

export function probabilityThresholdTable(inputForecasts, thresholds = [0.1, 0.25, 0.5, 0.75, 0.9]) {
  const forecasts = assertArray(inputForecasts, 'Threshold forecasts', { nonEmpty: true })
    .map(normalizeBinaryForecast);
  return assertArray(thresholds, 'Probability thresholds', { nonEmpty: true })
    .map((threshold) => confusion(forecasts, normalizeProbability(threshold, 'Probability threshold')))
    .sort((first, second) => first.threshold - second.threshold);
}

export function ensemblePercentiles(membersInput, levels = [0.1, 0.25, 0.5, 0.75, 0.9]) {
  const members = assertArray(membersInput, 'Ensemble members', { nonEmpty: true })
    .map((member, index) => assertFiniteNumber(member, `Ensemble member ${index + 1}`));
  return deepFreeze({
    minimum: minimum(members),
    maximum: maximum(members),
    mean: round(mean(members), 5),
    percentiles: Object.fromEntries(assertArray(levels, 'Percentile levels', { nonEmpty: true }).map((level) => {
      const probability = normalizeProbability(level, 'Percentile level');
      return [String(probability), round(quantile(members, probability), 5)];
    })),
  });
}

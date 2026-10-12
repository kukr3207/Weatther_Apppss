import { assertArray, assertFiniteNumber, deepFreeze, parseTimestamp, round } from '../core/validation';
import { mean, quantile, standardDeviation, sum } from '../core/statistics';

const DROUGHT_CLASSES = Object.freeze([
  { maximum: -2, code: 'exceptional', label: 'Exceptional drought', severity: 5 },
  { maximum: -1.5, code: 'extreme', label: 'Extreme drought', severity: 4 },
  { maximum: -1, code: 'severe', label: 'Severe drought', severity: 3 },
  { maximum: -0.5, code: 'moderate', label: 'Moderate drought', severity: 2 },
  { maximum: 0.5, code: 'normal', label: 'Near normal', severity: 0 },
  { maximum: 1, code: 'wet', label: 'Moderately wet', severity: 0 },
  { maximum: 1.5, code: 'very_wet', label: 'Very wet', severity: 0 },
  { maximum: Number.POSITIVE_INFINITY, code: 'exceptionally_wet', label: 'Exceptionally wet', severity: 0 },
]);

function normalizePrecipitation(record, index) {
  const observedAt = new Date(parseTimestamp(
    record.observedAt ?? record.date,
    `Precipitation record ${index + 1} time`,
  )).toISOString();
  return deepFreeze({
    observedAt,
    precipitationMm: assertFiniteNumber(
      record.precipitationMm ?? record.rainMm ?? 0,
      `Precipitation record ${index + 1} amount`,
      { minimum: 0 },
    ),
  });
}

function rollingTotals(records, windowDays) {
  const totals = [];
  for (let end = windowDays - 1; end < records.length; end += 1) {
    const selected = records.slice(end - windowDays + 1, end + 1);
    totals.push({
      observedAt: selected.at(-1).observedAt,
      precipitationMm: sum(selected.map((record) => record.precipitationMm)),
    });
  }
  return totals;
}

function droughtClass(index) {
  return DROUGHT_CLASSES.find((classification) => index <= classification.maximum) ?? DROUGHT_CLASSES.at(-1);
}

export function calculateStandardizedPrecipitationIndex(inputRecords, options = {}) {
  const windowDays = Math.trunc(assertFiniteNumber(options.windowDays ?? 30, 'SPI window', { minimum: 2, maximum: 730 }));
  const records = assertArray(inputRecords, 'Precipitation records', { nonEmpty: true }).map(normalizePrecipitation)
    .sort((first, second) => parseTimestamp(first.observedAt) - parseTimestamp(second.observedAt));
  if (records.length < windowDays * 2) {
    throw new TypeError(`SPI requires at least ${windowDays * 2} daily records for a ${windowDays}-day window.`);
  }
  const totals = rollingTotals(records, windowDays);
  const baselineStart = options.baselineStartsAt ? parseTimestamp(options.baselineStartsAt) : Number.NEGATIVE_INFINITY;
  const baselineEnd = options.baselineEndsAt ? parseTimestamp(options.baselineEndsAt) : Number.POSITIVE_INFINITY;
  const baseline = totals.filter((entry) => {
    const timestamp = parseTimestamp(entry.observedAt);
    return timestamp >= baselineStart && timestamp <= baselineEnd;
  }).map((entry) => Math.cbrt(entry.precipitationMm + 0.01));
  const baselineMean = mean(baseline);
  const baselineDeviation = standardDeviation(baseline);
  const series = totals.map((entry) => {
    const transformed = Math.cbrt(entry.precipitationMm + 0.01);
    const index = baselineDeviation > 0 ? (transformed - baselineMean) / baselineDeviation : 0;
    const classification = droughtClass(index);
    return deepFreeze({
      observedAt: entry.observedAt,
      precipitationMm: round(entry.precipitationMm, 2),
      index: round(index, 3),
      classification: classification.code,
      label: classification.label,
      severity: classification.severity,
    });
  });
  return deepFreeze({
    windowDays,
    baselineSampleCount: baseline.length,
    baselineMean: round(baselineMean, 4),
    baselineDeviation: round(baselineDeviation, 4),
    series,
    latest: series.at(-1),
  });
}

export function precipitationPercentiles(inputRecords, options = {}) {
  const records = assertArray(inputRecords, 'Precipitation records', { nonEmpty: true }).map(normalizePrecipitation);
  const values = records.map((record) => record.precipitationMm);
  const current = assertFiniteNumber(options.currentMm ?? values.at(-1), 'Current precipitation', { minimum: 0 });
  const belowOrEqual = values.filter((value) => value <= current).length;
  return deepFreeze({
    currentMm: current,
    percentile: round(belowOrEqual / values.length * 100, 1),
    p10: round(quantile(values, 0.1), 2),
    p25: round(quantile(values, 0.25), 2),
    median: round(quantile(values, 0.5), 2),
    p75: round(quantile(values, 0.75), 2),
    p90: round(quantile(values, 0.9), 2),
    sampleCount: values.length,
  });
}

export function assessDroughtRisk(input, options = {}) {
  const spi = assertFiniteNumber(input.spi ?? 0, 'SPI');
  const soilMoisturePercent = Number.isFinite(input.soilMoisturePercent) ? input.soilMoisturePercent : null;
  const reservoirPercent = Number.isFinite(input.reservoirPercent) ? input.reservoirPercent : null;
  const vegetationHealth = Number.isFinite(input.vegetationHealth) ? input.vegetationHealth : null;
  const forecastRainMm = Number.isFinite(input.forecastRainMm) ? input.forecastRainMm : 0;
  const components = [
    { name: 'precipitation', risk: Math.max(0, Math.min(100, -spi * 30 + 20)), weight: 0.4 },
    { name: 'soil', risk: soilMoisturePercent === null ? null : Math.max(0, 100 - soilMoisturePercent * 2), weight: 0.25 },
    { name: 'reservoir', risk: reservoirPercent === null ? null : Math.max(0, 100 - reservoirPercent), weight: 0.2 },
    { name: 'vegetation', risk: vegetationHealth === null ? null : Math.max(0, 100 - vegetationHealth), weight: 0.15 },
  ].filter((component) => component.risk !== null);
  const weight = sum(components.map((component) => component.weight));
  let score = weight ? sum(components.map((component) => component.risk * component.weight)) / weight : 0;
  score = Math.max(0, score - Math.min(30, forecastRainMm * (options.forecastRainReliefPerMm ?? 0.5)));
  const level = score >= 80 ? 'extreme'
    : score >= 60 ? 'high'
      : score >= 40 ? 'moderate'
        : score >= 20 ? 'watch' : 'low';
  const actions = [];
  if (level === 'extreme' || level === 'high') actions.push('Review water-use restrictions and emergency supply plans.');
  if (soilMoisturePercent !== null && soilMoisturePercent < 25) actions.push('Prioritize irrigation for vulnerable crops and young trees.');
  if (reservoirPercent !== null && reservoirPercent < 35) actions.push('Coordinate reservoir releases against essential demand.');
  if (forecastRainMm < 5) actions.push('Continue conservation measures; meaningful rain is not forecast.');
  return deepFreeze({
    score: round(score, 1),
    level,
    components: components.map((component) => ({ ...component, risk: round(component.risk, 1) })),
    forecastRainMm,
    actions,
  });
}

export function summarizeDroughtEpisodes(spiSeries, options = {}) {
  const threshold = options.threshold ?? -1;
  const episodes = [];
  let current = [];
  assertArray(spiSeries, 'SPI series').forEach((entry) => {
    if (entry.index <= threshold) current.push(entry);
    else if (current.length) {
      episodes.push(current);
      current = [];
    }
  });
  if (current.length) episodes.push(current);
  return episodes.map((episode, index) => deepFreeze({
    id: `drought-${index + 1}`,
    startsAt: episode[0].observedAt,
    endsAt: episode.at(-1).observedAt,
    duration: episode.length,
    minimumIndex: Math.min(...episode.map((entry) => entry.index)),
    peakClassification: episode.sort((first, second) => first.index - second.index)[0].classification,
    cumulativeDeficit: round(sum(episode.map((entry) => Math.abs(Math.min(0, entry.index - threshold)))), 3),
  }));
}

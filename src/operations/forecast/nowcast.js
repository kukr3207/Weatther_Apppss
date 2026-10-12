import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  clamp,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import { linearRegression, mean, standardDeviation } from '../core/statistics';
import { sortByTime } from '../core/timeSeries';

function normalizeReading(reading, index) {
  assertObject(reading, `Reading ${index + 1}`);
  const observedAt = new Date(parseTimestamp(reading.observedAt, `Reading ${index + 1} time`)).toISOString();
  return Object.freeze({
    ...reading,
    observedAt,
    precipitationRateMmPerHour: Number.isFinite(reading.precipitationRateMmPerHour)
      ? Math.max(0, reading.precipitationRateMmPerHour)
      : 0,
    precipitationProbability: Number.isFinite(reading.precipitationProbability)
      ? clamp(reading.precipitationProbability, 0, 1)
      : null,
  });
}

function regressionFor(readings, selector) {
  const origin = parseTimestamp(readings[0].observedAt);
  return linearRegression(readings.map((reading) => ({
    x: (parseTimestamp(reading.observedAt) - origin) / 60_000,
    y: selector(reading),
  })).filter((point) => Number.isFinite(point.y)));
}

function estimateValue(regression, minute, fallback, bounds = {}) {
  if (!Number.isFinite(regression.slope) || !Number.isFinite(regression.intercept)) return fallback;
  let value = regression.intercept + regression.slope * minute;
  if (Number.isFinite(bounds.minimum)) value = Math.max(bounds.minimum, value);
  if (Number.isFinite(bounds.maximum)) value = Math.min(bounds.maximum, value);
  return value;
}

function precipitationKind(reading) {
  if (Number.isFinite(reading.snowRateMmPerHour) && reading.snowRateMmPerHour > 0) return 'snow';
  if (Number.isFinite(reading.freezingRainRateMmPerHour) && reading.freezingRainRateMmPerHour > 0) {
    return 'freezing_rain';
  }
  if (reading.precipitationType) return reading.precipitationType;
  return reading.precipitationRateMmPerHour > 0 ? 'rain' : 'none';
}

function intensity(rate) {
  if (rate <= 0) return 'none';
  if (rate < 0.5) return 'trace';
  if (rate < 2.5) return 'light';
  if (rate < 7.5) return 'moderate';
  if (rate < 20) return 'heavy';
  return 'extreme';
}

function summarizeTransitions(periods) {
  const transitions = [];
  periods.forEach((period, index) => {
    if (index === 0) return;
    const previous = periods[index - 1];
    if (period.intensity !== previous.intensity || period.precipitationType !== previous.precipitationType) {
      transitions.push(Object.freeze({
        at: period.forecastAt,
        from: `${previous.intensity}_${previous.precipitationType}`,
        to: `${period.intensity}_${period.precipitationType}`,
      }));
    }
  });
  return transitions;
}

export function createPrecipitationNowcast(inputReadings, inputOptions = {}) {
  const readings = sortByTime(
    assertArray(inputReadings, 'Nowcast readings', { nonEmpty: true }).map(normalizeReading),
    (reading) => reading.observedAt,
  );
  const horizonMinutes = assertFiniteNumber(inputOptions.horizonMinutes ?? 120, 'Nowcast horizon', {
    minimum: 15,
    maximum: 360,
  });
  const intervalMinutes = assertFiniteNumber(inputOptions.intervalMinutes ?? 10, 'Nowcast interval', {
    minimum: 1,
    maximum: 60,
  });
  const latest = readings.at(-1);
  const rateRegression = regressionFor(readings, (reading) => reading.precipitationRateMmPerHour);
  const probabilityRegression = regressionFor(readings, (reading) => reading.precipitationProbability);
  const temperatureRegression = regressionFor(readings, (reading) => reading.temperatureC);
  const cloudRegression = regressionFor(readings, (reading) => reading.cloudPercent);
  const latestTime = parseTimestamp(latest.observedAt);
  const originTime = parseTimestamp(readings[0].observedAt);
  const elapsedAtLatest = (latestTime - originTime) / 60_000;
  const periodCount = Math.ceil(horizonMinutes / intervalMinutes);
  const periods = Array.from({ length: periodCount + 1 }, (_, index) => {
    const futureMinutes = index * intervalMinutes;
    const regressionMinute = elapsedAtLatest + futureMinutes;
    const rate = estimateValue(
      rateRegression,
      regressionMinute,
      latest.precipitationRateMmPerHour,
      { minimum: 0, maximum: 100 },
    );
    const probability = estimateValue(
      probabilityRegression,
      regressionMinute,
      latest.precipitationProbability ?? (rate > 0 ? 0.7 : 0.1),
      { minimum: 0, maximum: 1 },
    );
    const temperatureC = estimateValue(
      temperatureRegression,
      regressionMinute,
      latest.temperatureC ?? null,
      { minimum: -90, maximum: 70 },
    );
    const cloudPercent = estimateValue(
      cloudRegression,
      regressionMinute,
      latest.cloudPercent ?? null,
      { minimum: 0, maximum: 100 },
    );
    let type = precipitationKind(latest);
    if (Number.isFinite(temperatureC) && temperatureC <= -0.5 && rate > 0) type = 'snow';
    if (Number.isFinite(temperatureC) && temperatureC > -0.5 && temperatureC <= 1 && rate > 0) {
      type = 'mixed';
    }
    if (rate < 0.01 || probability < 0.1) type = 'none';
    return Object.freeze({
      forecastAt: new Date(latestTime + futureMinutes * 60_000).toISOString(),
      minutesFromNow: futureMinutes,
      precipitationRateMmPerHour: round(rate, 2),
      precipitationProbability: round(probability, 3),
      precipitationType: type,
      intensity: intensity(rate),
      temperatureC: round(temperatureC, 1),
      cloudPercent: round(cloudPercent, 0),
    });
  });
  const rates = readings.map((reading) => reading.precipitationRateMmPerHour);
  const volatility = standardDeviation(rates) ?? 0;
  const sampleSpanMinutes = (latestTime - parseTimestamp(readings[0].observedAt)) / 60_000;
  const confidence = clamp(
    35
    + Math.min(25, readings.length * 4)
    + Math.min(20, sampleSpanMinutes / 3)
    + (Math.abs(rateRegression.correlation ?? 0) * 20)
    - Math.min(25, volatility * 2),
    0,
    100,
  );
  const totalMm = periods.slice(1).reduce((total, period) => (
    total + period.precipitationRateMmPerHour * intervalMinutes / 60
  ), 0);
  const wetPeriods = periods.filter((period) => period.precipitationRateMmPerHour >= 0.01);
  const peak = [...periods].sort((first, second) => (
    second.precipitationRateMmPerHour - first.precipitationRateMmPerHour
  ))[0];
  return deepFreeze({
    generatedAt: latest.observedAt,
    validUntil: periods.at(-1).forecastAt,
    confidence: round(confidence, 1),
    sampleCount: readings.length,
    sampleSpanMinutes: round(sampleSpanMinutes, 1),
    periods,
    transitions: summarizeTransitions(periods),
    summary: {
      precipitationStartsAt: wetPeriods[0]?.forecastAt ?? null,
      precipitationEndsAt: wetPeriods.at(-1)?.forecastAt ?? null,
      totalPrecipitationMm: round(totalMm, 2),
      peakRateMmPerHour: peak.precipitationRateMmPerHour,
      peakAt: peak.forecastAt,
      dominantType: periods
        .map((period) => period.precipitationType)
        .filter((type) => type !== 'none')
        .sort((first, second) => (
          periods.filter((period) => period.precipitationType === second).length
          - periods.filter((period) => period.precipitationType === first).length
        ))[0] ?? 'none',
    },
    diagnostics: {
      rateTrendPerHour: round((rateRegression.slope ?? 0) * 60, 3),
      rateCorrelation: round(rateRegression.correlation, 3),
      rateVolatility: round(volatility, 3),
      observedAverageRate: round(mean(rates), 3),
    },
  });
}

export function nowcastHeadline(nowcast) {
  if (!nowcast?.summary) return 'Minute-by-minute precipitation is unavailable.';
  if (!nowcast.summary.precipitationStartsAt) return 'No precipitation is expected in the next two hours.';
  const type = String(nowcast.summary.dominantType).replace('_', ' ');
  const peak = nowcast.summary.peakRateMmPerHour;
  return `${type[0].toUpperCase()}${type.slice(1)} is expected, peaking near ${peak} mm/h.`;
}

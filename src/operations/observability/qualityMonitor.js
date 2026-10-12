import { assertArray, assertFiniteNumber, assertObject, deepFreeze, parseTimestamp, round } from '../core/validation';
import { mean, quantile } from '../core/statistics';

const DEFAULT_POLICY = Object.freeze({
  maximumAgeMinutes: 90,
  minimumCompleteness: 0.8,
  maximumLatencyMs: 5000,
  maximumTemperatureJumpC: 15,
  maximumPressureJumpHpa: 30,
  maximumWindSpeedMps: 100,
  maximumPrecipitationProbability: 1,
});

function valueAt(record, field) {
  return field.split('.').reduce((value, part) => value?.[part], record);
}

function issue(code, severity, message, field = null, details = {}) {
  return deepFreeze({ code, severity, message, field, details: deepFreeze({ ...details }) });
}

export function evaluateObservationQuality(observation, options = {}) {
  assertObject(observation, 'Weather observation');
  const policy = { ...DEFAULT_POLICY, ...(options.policy ?? {}) };
  const now = parseTimestamp(options.now ?? Date.now());
  const timestampValue = observation.observedAt ?? observation.forecastAt ?? observation.receivedAt;
  const issues = [];
  let timestamp = null;
  try {
    timestamp = parseTimestamp(timestampValue, 'Observation time');
  } catch (error) {
    issues.push(issue('invalid_timestamp', 'error', error.message, 'observedAt'));
  }
  if (Number.isFinite(timestamp)) {
    const ageMinutes = (now - timestamp) / 60_000;
    if (ageMinutes > policy.maximumAgeMinutes) {
      issues.push(issue('stale', 'error', 'Observation is older than the freshness policy.', 'observedAt', {
        ageMinutes: round(ageMinutes, 1),
        maximumAgeMinutes: policy.maximumAgeMinutes,
      }));
    }
    if (ageMinutes < -5) issues.push(issue('future_timestamp', 'warning', 'Observation time is in the future.', 'observedAt'));
  }
  const required = options.requiredFields ?? ['temperatureC', 'humidityPercent', 'windSpeedMps', 'pressureHpa'];
  const present = required.filter((field) => valueAt(observation, field) !== null && valueAt(observation, field) !== undefined);
  const completeness = required.length ? present.length / required.length : 1;
  if (completeness < policy.minimumCompleteness) {
    issues.push(issue('incomplete', 'error', 'Observation is missing required weather fields.', null, {
      missing: required.filter((field) => !present.includes(field)),
      completeness: round(completeness, 4),
    }));
  }
  const ranges = {
    temperatureC: [-100, 70],
    humidityPercent: [0, 100],
    windSpeedMps: [0, policy.maximumWindSpeedMps],
    pressureHpa: [800, 1100],
    visibilityMeters: [0, 100_000],
    precipitationProbability: [0, policy.maximumPrecipitationProbability],
    cloudPercent: [0, 100],
  };
  Object.entries(ranges).forEach(([field, [minimum, maximum]]) => {
    const value = observation[field];
    if (value === null || value === undefined) return;
    if (!Number.isFinite(value)) issues.push(issue('not_numeric', 'error', `${field} must be numeric.`, field));
    else if (value < minimum || value > maximum) {
      issues.push(issue('out_of_range', 'error', `${field} is outside its physical range.`, field, { minimum, maximum, value }));
    }
  });
  const previous = options.previous;
  if (previous) {
    const jumps = [
      ['temperatureC', policy.maximumTemperatureJumpC],
      ['pressureHpa', policy.maximumPressureJumpHpa],
    ];
    jumps.forEach(([field, maximumChange]) => {
      if (Number.isFinite(observation[field]) && Number.isFinite(previous[field])) {
        const change = Math.abs(observation[field] - previous[field]);
        if (change > maximumChange) {
          issues.push(issue('sudden_change', 'warning', `${field} changed unusually quickly.`, field, {
            previous: previous[field],
            current: observation[field],
            change: round(change, 2),
            maximumChange,
          }));
        }
      }
    });
  }
  if (Number.isFinite(observation.latencyMs) && observation.latencyMs > policy.maximumLatencyMs) {
    issues.push(issue('high_latency', 'warning', 'Provider response exceeded the latency target.', 'latencyMs', {
      latencyMs: observation.latencyMs,
      maximumLatencyMs: policy.maximumLatencyMs,
    }));
  }
  const penalty = issues.reduce((total, entry) => total + (entry.severity === 'error' ? 25 : 10), 0);
  return deepFreeze({
    valid: !issues.some((entry) => entry.severity === 'error'),
    score: Math.max(0, round(100 * completeness - penalty, 1)),
    completeness: round(completeness, 4),
    observedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    issues,
  });
}

export function evaluateProviderQuality(inputObservations, options = {}) {
  const observations = assertArray(inputObservations, 'Provider observations');
  const results = observations.map((observation, index) => evaluateObservationQuality(observation, {
    ...options,
    previous: index > 0 ? observations[index - 1] : options.previous,
  }));
  const issueCounts = {};
  results.flatMap((result) => result.issues).forEach((entry) => {
    issueCounts[entry.code] = (issueCounts[entry.code] ?? 0) + 1;
  });
  const latencies = observations.map((observation) => observation.latencyMs).filter(Number.isFinite);
  return deepFreeze({
    sampleCount: results.length,
    validCount: results.filter((result) => result.valid).length,
    invalidCount: results.filter((result) => !result.valid).length,
    validRatio: results.length ? round(results.filter((result) => result.valid).length / results.length, 4) : null,
    averageScore: round(mean(results.map((result) => result.score)), 1),
    issueCounts,
    latency: {
      meanMs: round(mean(latencies), 1),
      p50Ms: round(quantile(latencies, 0.5), 1),
      p95Ms: round(quantile(latencies, 0.95), 1),
    },
    results,
  });
}

export function qualityGate(report, thresholds = {}) {
  assertObject(report, 'Provider quality report');
  const minimumValidRatio = assertFiniteNumber(thresholds.minimumValidRatio ?? 0.9, 'Minimum valid ratio', {
    minimum: 0,
    maximum: 1,
  });
  const minimumAverageScore = assertFiniteNumber(thresholds.minimumAverageScore ?? 75, 'Minimum average score', {
    minimum: 0,
    maximum: 100,
  });
  const reasons = [];
  if (report.sampleCount === 0) reasons.push('No observations were evaluated.');
  if (Number.isFinite(report.validRatio) && report.validRatio < minimumValidRatio) {
    reasons.push(`Valid ratio ${report.validRatio} is below ${minimumValidRatio}.`);
  }
  if (Number.isFinite(report.averageScore) && report.averageScore < minimumAverageScore) {
    reasons.push(`Average score ${report.averageScore} is below ${minimumAverageScore}.`);
  }
  return deepFreeze({
    passed: reasons.length === 0,
    reasons,
    thresholds: { minimumValidRatio, minimumAverageScore },
  });
}

export function compareProviderQuality(reports) {
  return assertArray(reports, 'Provider quality reports').map((entry, index) => ({
    providerId: entry.providerId ?? `provider-${index + 1}`,
    sampleCount: entry.sampleCount ?? 0,
    validRatio: entry.validRatio ?? null,
    averageScore: entry.averageScore ?? null,
    p95LatencyMs: entry.latency?.p95Ms ?? null,
    report: entry,
  })).sort((first, second) => (
    (second.validRatio ?? -1) - (first.validRatio ?? -1)
    || (second.averageScore ?? -1) - (first.averageScore ?? -1)
    || (first.p95LatencyMs ?? Number.POSITIVE_INFINITY) - (second.p95LatencyMs ?? Number.POSITIVE_INFINITY)
  )).map((entry, index) => deepFreeze({ ...entry, rank: index + 1 }));
}

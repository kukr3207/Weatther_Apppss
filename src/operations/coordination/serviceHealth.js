import { assertArray, assertFiniteNumber, assertObject, assertString, clamp, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, quantile } from '../core/statistics';

function normalizeSample(sample, index) {
  assertObject(sample, `Health sample ${index + 1}`);
  return Object.freeze({
    at: new Date(parseTimestamp(sample.at ?? sample.observedAt ?? sample.occurredAt)).toISOString(),
    success: sample.success === true,
    latencyMs: Number.isFinite(sample.latencyMs) ? Math.max(0, sample.latencyMs) : null,
    statusCode: Number.isInteger(sample.statusCode) ? sample.statusCode : null,
    errorCode: typeof sample.errorCode === 'string' ? sample.errorCode : null,
  });
}

export function assessProviderHealth(providerInput, samplesInput, options = {}) {
  assertObject(providerInput, 'Provider');
  const provider = {
    id: assertString(providerInput.id, 'Provider id', { maximum: 120 }),
    name: providerInput.name ?? providerInput.id,
  };
  const samples = assertArray(samplesInput, 'Health samples').map(normalizeSample)
    .sort((first, second) => parseTimestamp(first.at) - parseTimestamp(second.at));
  const now = parseTimestamp(options.now ?? new Date().toISOString());
  const windowMinutes = assertFiniteNumber(options.windowMinutes ?? 60, 'Health window', { minimum: 1, maximum: 43_200 });
  const selected = samples.filter((sample) => now - parseTimestamp(sample.at) <= windowMinutes * 60_000);
  const total = selected.length;
  const successes = selected.filter((sample) => sample.success).length;
  const availability = total ? successes / total : null;
  const latencies = selected.map((sample) => sample.latencyMs).filter(Number.isFinite);
  const errorRate = total ? 1 - successes / total : null;
  const recentFailures = [...selected].reverse().findIndex((sample) => sample.success);
  const consecutiveFailures = recentFailures === -1 ? total : recentFailures;
  const latencyTarget = options.latencyTargetMs ?? 1500;
  const availabilityTarget = options.availabilityTarget ?? 0.99;
  let score = 100;
  if (availability !== null) score -= Math.max(0, availabilityTarget - availability) * 200;
  const p95 = quantile(latencies, 0.95);
  if (Number.isFinite(p95) && p95 > latencyTarget) score -= Math.min(30, (p95 - latencyTarget) / latencyTarget * 30);
  score -= Math.min(35, consecutiveFailures * 8);
  if (!total) score = 0;
  score = clamp(score, 0, 100);
  return deepFreeze({
    provider,
    assessedAt: new Date(now).toISOString(),
    status: !total ? 'unknown' : score >= 90 ? 'healthy' : score >= 65 ? 'degraded' : 'unhealthy',
    score: round(score, 1),
    sampleCount: total,
    availability: round(availability, 4),
    successRate: round(availability, 4),
    errorRate: round(errorRate, 4),
    consecutiveFailures,
    latency: {
      averageMs: round(mean(latencies), 1),
      p95Ms: round(p95, 1),
      maximumMs: round(maximum(latencies), 1),
    },
    errorCodes: Object.fromEntries([...new Set(selected.map((sample) => sample.errorCode).filter(Boolean))]
      .map((code) => [code, selected.filter((sample) => sample.errorCode === code).length])),
  });
}

export function chooseHealthyProvider(healthReports, options = {}) {
  const required = new Set(options.required ?? []);
  const ranked = assertArray(healthReports, 'Provider health reports').filter((report) => {
    if (!required.size) return true;
    return required.has(report.provider?.id);
  }).sort((first, second) => (
    (second.score ?? -1) - (first.score ?? -1)
    || (first.latency?.p95Ms ?? Infinity) - (second.latency?.p95Ms ?? Infinity)
    || first.provider.id.localeCompare(second.provider.id)
  ));
  return ranked.find((report) => report.status !== 'unknown' && report.score >= (options.minimumScore ?? 50)) ?? null;
}

export function providerCircuitDecision(report, state = {}, options = {}) {
  const threshold = options.failureThreshold ?? 3;
  const recoveryThreshold = options.recoveryThreshold ?? 2;
  let mode = state.mode ?? 'closed';
  let recoveryCount = state.recoveryCount ?? 0;
  const failures = report.consecutiveFailures ?? state.failures ?? 0;
  if (mode === 'closed' && failures >= threshold) {
    mode = 'open';
    recoveryCount = 0;
  } else if (mode === 'open' && options.probeAllowed) {
    mode = 'half_open';
  } else if (mode === 'half_open' && report.status === 'healthy') {
    recoveryCount += 1;
    if (recoveryCount >= recoveryThreshold) {
      mode = 'closed';
      recoveryCount = 0;
    }
  } else if (mode === 'half_open' && report.status === 'unhealthy') {
    mode = 'open';
    recoveryCount = 0;
  }
  return deepFreeze({
    mode,
    state: mode,
    recoveryCount,
    allowRequest: mode === 'closed' || mode === 'half_open',
    providerId: report.provider.id,
  });
}

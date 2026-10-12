import {
  assertFiniteNumber,
  assertInteger,
  assertObject,
  clamp,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';

const NETWORK_FACTORS = Object.freeze({
  offline: Number.POSITIVE_INFINITY,
  constrained: 2.5,
  cellular: 1.5,
  normal: 1,
  fast: 0.8,
});

const PRIORITY_FACTORS = Object.freeze({
  background: 2,
  normal: 1,
  elevated: 0.6,
  urgent: 0.25,
});

function normalizeState(state) {
  assertObject(state, 'Refresh state');
  const now = parseTimestamp(state.now ?? new Date().toISOString(), 'Current time');
  const lastSuccess = state.lastSuccessAt ? parseTimestamp(state.lastSuccessAt, 'Last success') : null;
  const lastAttempt = state.lastAttemptAt ? parseTimestamp(state.lastAttemptAt, 'Last attempt') : null;
  return Object.freeze({
    now,
    lastSuccess,
    lastAttempt,
    consecutiveFailures: assertInteger(state.consecutiveFailures ?? 0, 'Consecutive failures', { minimum: 0 }),
    visible: state.visible !== false,
    online: state.online !== false,
    batteryPercent: Number.isFinite(state.batteryPercent) ? clamp(state.batteryPercent, 0, 100) : null,
    charging: state.charging === true,
    network: NETWORK_FACTORS[state.network] ? state.network : 'normal',
    priority: PRIORITY_FACTORS[state.priority] ? state.priority : 'normal',
    activeAlertCount: assertInteger(state.activeAlertCount ?? 0, 'Active alert count', { minimum: 0 }),
    forecastAgeMinutes: Number.isFinite(state.forecastAgeMinutes)
      ? Math.max(0, state.forecastAgeMinutes)
      : (lastSuccess ? Math.max(0, now - lastSuccess) / 60_000 : Number.POSITIVE_INFINITY),
    userRequested: state.userRequested === true,
  });
}

export function calculateRefreshDecision(inputState, inputPolicy = {}) {
  const state = normalizeState(inputState);
  const policy = {
    baseIntervalMinutes: assertFiniteNumber(
      inputPolicy.baseIntervalMinutes ?? 15,
      'Base refresh interval',
      { minimum: 1, maximum: 1440 },
    ),
    maximumIntervalMinutes: assertFiniteNumber(
      inputPolicy.maximumIntervalMinutes ?? 180,
      'Maximum refresh interval',
      { minimum: 1, maximum: 2880 },
    ),
    minimumIntervalMinutes: assertFiniteNumber(
      inputPolicy.minimumIntervalMinutes ?? 2,
      'Minimum refresh interval',
      { minimum: 0, maximum: 60 },
    ),
    staleAfterMinutes: assertFiniteNumber(
      inputPolicy.staleAfterMinutes ?? 30,
      'Stale threshold',
      { minimum: 1, maximum: 2880 },
    ),
    failureBackoffFactor: assertFiniteNumber(
      inputPolicy.failureBackoffFactor ?? 2,
      'Failure backoff factor',
      { minimum: 1, maximum: 10 },
    ),
    maximumFailuresBeforePause: assertInteger(
      inputPolicy.maximumFailuresBeforePause ?? 6,
      'Maximum failures before pause',
      { minimum: 1, maximum: 50 },
    ),
    lowBatteryThreshold: assertFiniteNumber(
      inputPolicy.lowBatteryThreshold ?? 20,
      'Low battery threshold',
      { minimum: 1, maximum: 100 },
    ),
    refreshWhileHidden: inputPolicy.refreshWhileHidden === true,
  };
  const reasons = [];
  if (!state.online) {
    return deepFreeze({ shouldRefresh: false, pauseReason: 'offline', nextAttemptAt: null, reasons: ['Device is offline.'] });
  }
  if (!state.visible && !policy.refreshWhileHidden && !state.userRequested && state.activeAlertCount === 0) {
    return deepFreeze({
      shouldRefresh: false,
      pauseReason: 'hidden',
      nextAttemptAt: null,
      reasons: ['Workspace is not visible.'],
    });
  }
  if (state.consecutiveFailures >= policy.maximumFailuresBeforePause && !state.userRequested) {
    return deepFreeze({
      shouldRefresh: false,
      pauseReason: 'failure_limit',
      nextAttemptAt: null,
      reasons: ['Automatic refresh paused after repeated failures.'],
    });
  }
  let interval = policy.baseIntervalMinutes;
  interval *= NETWORK_FACTORS[state.network];
  interval *= PRIORITY_FACTORS[state.priority];
  if (state.activeAlertCount > 0) {
    interval *= Math.max(0.3, 1 - Math.min(5, state.activeAlertCount) * 0.1);
    reasons.push('Active weather alerts shorten the refresh interval.');
  }
  if (Number.isFinite(state.batteryPercent)
      && state.batteryPercent <= policy.lowBatteryThreshold
      && !state.charging) {
    interval *= 2;
    reasons.push('Low battery extends the refresh interval.');
  }
  if (state.consecutiveFailures > 0) {
    interval *= policy.failureBackoffFactor ** Math.min(state.consecutiveFailures, 8);
    reasons.push('Recent failures apply exponential backoff.');
  }
  if (state.forecastAgeMinutes >= policy.staleAfterMinutes * 2) {
    interval = Math.min(interval, policy.minimumIntervalMinutes);
    reasons.push('Forecast data is significantly stale.');
  } else if (state.forecastAgeMinutes >= policy.staleAfterMinutes) {
    interval = Math.min(interval, policy.baseIntervalMinutes / 2);
    reasons.push('Forecast data is stale.');
  }
  interval = clamp(interval, policy.minimumIntervalMinutes, policy.maximumIntervalMinutes);
  const lastReference = state.lastAttempt ?? state.lastSuccess ?? 0;
  const nextAttempt = lastReference + interval * 60_000;
  const shouldRefresh = state.userRequested || state.now >= nextAttempt || state.lastSuccess === null;
  if (state.userRequested) reasons.push('The user requested an update.');
  if (state.lastSuccess === null) reasons.push('No successful refresh has been recorded.');
  if (!reasons.length) reasons.push('The normal refresh cadence applies.');
  return deepFreeze({
    shouldRefresh,
    pauseReason: null,
    intervalMinutes: round(interval, 2),
    nextAttemptAt: shouldRefresh ? new Date(state.now).toISOString() : new Date(nextAttempt).toISOString(),
    overdueMinutes: shouldRefresh ? round(Math.max(0, state.now - nextAttempt) / 60_000, 2) : 0,
    reasons,
  });
}

export function updateRefreshState(previous, outcome, options = {}) {
  const current = normalizeState({ ...previous, now: options.now ?? new Date().toISOString() });
  const attemptedAt = new Date(current.now).toISOString();
  if (outcome?.success) {
    return deepFreeze({
      ...previous,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      consecutiveFailures: 0,
      lastError: null,
      lastSource: outcome.source ?? previous?.lastSource ?? null,
    });
  }
  return deepFreeze({
    ...previous,
    lastAttemptAt: attemptedAt,
    consecutiveFailures: current.consecutiveFailures + 1,
    lastError: typeof outcome?.error === 'string'
      ? outcome.error
      : outcome?.error?.message ?? 'Refresh failed.',
  });
}

export function createRefreshSchedule(state, policy, count = 6) {
  const schedule = [];
  let current = { ...state };
  const total = assertInteger(count, 'Schedule count', { minimum: 1, maximum: 100 });
  for (let index = 0; index < total; index += 1) {
    const decision = calculateRefreshDecision(current, policy);
    if (!decision.nextAttemptAt) break;
    schedule.push(Object.freeze({
      index,
      at: decision.nextAttemptAt,
      intervalMinutes: decision.intervalMinutes ?? null,
      shouldRefresh: decision.shouldRefresh,
    }));
    current = {
      ...current,
      now: decision.nextAttemptAt,
      lastAttemptAt: decision.nextAttemptAt,
      lastSuccessAt: decision.nextAttemptAt,
      consecutiveFailures: 0,
    };
  }
  return schedule;
}

import {
  assertArray,
  assertEnum,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  normalizeLocation,
  parseTimestamp,
  round,
} from '../core/validation';
import { evaluateAlertRules } from './ruleEngine';

const WATCH_STATES = Object.freeze(['active', 'paused', 'completed', 'expired']);

function normalizeWatch(watch, index = 0) {
  assertObject(watch, `Watch ${index + 1}`);
  const id = assertString(watch.id, `Watch ${index + 1} id`, { maximum: 160 });
  const createdAt = new Date(parseTimestamp(watch.createdAt ?? new Date().toISOString())).toISOString();
  const startsAt = new Date(parseTimestamp(watch.startsAt ?? createdAt)).toISOString();
  const endsAt = watch.endsAt ? new Date(parseTimestamp(watch.endsAt)).toISOString() : null;
  if (endsAt && parseTimestamp(endsAt) <= parseTimestamp(startsAt)) {
    throw new TypeError('Watch end must be after its start.');
  }
  return deepFreeze({
    ...watch,
    id,
    name: assertString(watch.name ?? id, `Watch ${id} name`, { maximum: 160 }),
    location: normalizeLocation(watch.location, `Watch ${id} location`),
    state: assertEnum(watch.state ?? 'active', WATCH_STATES, `Watch ${id} state`),
    rules: assertArray(watch.rules, `Watch ${id} rules`, { nonEmpty: true }),
    createdAt,
    startsAt,
    endsAt,
    repeatPolicy: watch.repeatPolicy === 'once' ? 'once' : 'until_end',
    maximumTriggers: assertFiniteNumber(watch.maximumTriggers ?? 100, `Watch ${id} maximum triggers`, {
      minimum: 1,
      maximum: 10_000,
    }),
    triggerCount: assertFiniteNumber(watch.triggerCount ?? 0, `Watch ${id} trigger count`, { minimum: 0 }),
    lastEvaluatedAt: watch.lastEvaluatedAt
      ? new Date(parseTimestamp(watch.lastEvaluatedAt)).toISOString()
      : null,
    lastTriggeredAt: watch.lastTriggeredAt
      ? new Date(parseTimestamp(watch.lastTriggeredAt)).toISOString()
      : null,
  });
}

export function createForecastWatch(input) {
  return normalizeWatch({
    ...input,
    state: 'active',
    triggerCount: 0,
    createdAt: input.createdAt ?? new Date().toISOString(),
    lastEvaluatedAt: null,
    lastTriggeredAt: null,
  });
}

export function evaluateForecastWatch(inputWatch, observation, options = {}) {
  const watch = normalizeWatch(inputWatch);
  const now = parseTimestamp(options.at ?? observation?.observedAt ?? observation?.forecastAt ?? new Date().toISOString());
  let state = watch.state;
  const reasons = [];
  if (state === 'paused') {
    return deepFreeze({ watch, alerts: [], triggered: false, skipped: true, reason: 'paused' });
  }
  if (['completed', 'expired'].includes(state)) {
    return deepFreeze({ watch, alerts: [], triggered: false, skipped: true, reason: state });
  }
  if (now < parseTimestamp(watch.startsAt)) {
    return deepFreeze({ watch, alerts: [], triggered: false, skipped: true, reason: 'not_started' });
  }
  if (watch.endsAt && now >= parseTimestamp(watch.endsAt)) {
    state = 'expired';
    reasons.push('The watch window ended.');
  }
  if (watch.triggerCount >= watch.maximumTriggers) {
    state = 'completed';
    reasons.push('The watch reached its trigger limit.');
  }
  if (state !== 'active') {
    return deepFreeze({
      watch: { ...watch, state, lastEvaluatedAt: new Date(now).toISOString() },
      alerts: [],
      triggered: false,
      skipped: true,
      reason: state,
    });
  }
  const evaluation = evaluateAlertRules(watch.rules, observation, {
    at: now,
    previous: options.previous,
    priorAlerts: options.priorAlerts,
  });
  const triggered = evaluation.alerts.length > 0;
  const triggerCount = watch.triggerCount + (triggered ? 1 : 0);
  if (triggered) reasons.push(`${evaluation.alerts.length} alert condition(s) matched.`);
  if (!triggered) reasons.push('No watch conditions matched.');
  if (triggered && watch.repeatPolicy === 'once') state = 'completed';
  if (triggerCount >= watch.maximumTriggers) state = 'completed';
  const nextWatch = deepFreeze({
    ...watch,
    state,
    triggerCount,
    lastEvaluatedAt: new Date(now).toISOString(),
    lastTriggeredAt: triggered ? new Date(now).toISOString() : watch.lastTriggeredAt,
  });
  return deepFreeze({
    watch: nextWatch,
    alerts: evaluation.alerts.map((alert) => ({ ...alert, watchId: watch.id, location: watch.location })),
    triggered,
    skipped: false,
    reason: null,
    reasons,
    evaluation,
  });
}

export function evaluateWatchCollection(watches, observationsByLocation, options = {}) {
  const normalized = assertArray(watches, 'Forecast watches').map(normalizeWatch);
  const results = normalized.map((watch) => {
    const observation = observationsByLocation instanceof Map
      ? observationsByLocation.get(watch.location.id)
      : observationsByLocation?.[watch.location.id];
    if (!observation) {
      return deepFreeze({ watch, alerts: [], triggered: false, skipped: true, reason: 'missing_observation' });
    }
    return evaluateForecastWatch(watch, observation, options);
  });
  return deepFreeze({
    results,
    watches: results.map((result) => result.watch),
    alerts: results.flatMap((result) => result.alerts),
    summary: {
      evaluated: results.filter((result) => !result.skipped).length,
      triggered: results.filter((result) => result.triggered).length,
      skipped: results.filter((result) => result.skipped).length,
    },
  });
}

export function pauseWatch(watch, at = new Date().toISOString()) {
  const normalized = normalizeWatch(watch);
  if (['completed', 'expired'].includes(normalized.state)) return normalized;
  return deepFreeze({ ...normalized, state: 'paused', pausedAt: new Date(parseTimestamp(at)).toISOString() });
}

export function resumeWatch(watch, at = new Date().toISOString()) {
  const normalized = normalizeWatch(watch);
  if (normalized.state !== 'paused') return normalized;
  const timestamp = parseTimestamp(at);
  const state = normalized.endsAt && timestamp >= parseTimestamp(normalized.endsAt) ? 'expired' : 'active';
  return deepFreeze({
    ...normalized,
    state,
    resumedAt: new Date(timestamp).toISOString(),
    pausedAt: null,
  });
}

export function watchProgress(watch, now = new Date().toISOString()) {
  const normalized = normalizeWatch(watch);
  if (!normalized.endsAt) return null;
  const start = parseTimestamp(normalized.startsAt);
  const end = parseTimestamp(normalized.endsAt);
  const current = parseTimestamp(now);
  return round(Math.min(1, Math.max(0, (current - start) / (end - start))), 4);
}

export const FORECAST_WATCH_STATES = WATCH_STATES;

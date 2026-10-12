import {
  assertArray,
  assertEnum,
  assertObject,
  assertString,
  deepFreeze,
  parseTimestamp,
} from '../core/validation';

const STATES = Object.freeze(['active', 'acknowledged', 'snoozed', 'resolved', 'expired']);

function normalizeActor(actor) {
  if (!actor) return Object.freeze({ id: 'system', name: 'System' });
  if (typeof actor === 'string') return Object.freeze({ id: actor, name: actor });
  return Object.freeze({
    id: assertString(actor.id, 'Actor id', { maximum: 120 }),
    name: assertString(actor.name ?? actor.id, 'Actor name', { maximum: 160 }),
  });
}

function normalizeAlert(alert) {
  assertObject(alert, 'Alert');
  const id = assertString(alert.id, 'Alert id', { maximum: 200 });
  const state = assertEnum(alert.state ?? 'active', STATES, 'Alert state');
  const createdAt = new Date(parseTimestamp(alert.createdAt ?? alert.triggeredAt)).toISOString();
  return deepFreeze({
    ...alert,
    id,
    state,
    createdAt,
    updatedAt: new Date(parseTimestamp(alert.updatedAt ?? createdAt)).toISOString(),
    acknowledgedAt: alert.acknowledgedAt
      ? new Date(parseTimestamp(alert.acknowledgedAt)).toISOString()
      : null,
    snoozedUntil: alert.snoozedUntil ? new Date(parseTimestamp(alert.snoozedUntil)).toISOString() : null,
    resolvedAt: alert.resolvedAt ? new Date(parseTimestamp(alert.resolvedAt)).toISOString() : null,
    expiresAt: alert.expiresAt ? new Date(parseTimestamp(alert.expiresAt)).toISOString() : null,
    history: Array.isArray(alert.history) ? alert.history : [],
  });
}

function historyEntry(type, at, actor, details = {}) {
  return deepFreeze({
    type,
    at: new Date(parseTimestamp(at)).toISOString(),
    actor: normalizeActor(actor),
    details,
  });
}

function transition(alert, state, at, actor, type, changes = {}, details = {}) {
  const normalized = normalizeAlert(alert);
  const timestamp = new Date(parseTimestamp(at ?? new Date().toISOString())).toISOString();
  if (parseTimestamp(timestamp) < parseTimestamp(normalized.updatedAt)) {
    throw new TypeError('Alert transitions cannot move backward in time.');
  }
  return deepFreeze({
    ...normalized,
    ...changes,
    state,
    updatedAt: timestamp,
    history: [...normalized.history, historyEntry(type, timestamp, actor, details)],
  });
}

export function createManagedAlert(alert, options = {}) {
  const normalized = normalizeAlert({ ...alert, state: 'active' });
  const actor = normalizeActor(options.actor);
  return deepFreeze({
    ...normalized,
    history: normalized.history.length ? normalized.history : [historyEntry(
      'created',
      normalized.createdAt,
      actor,
      { severity: normalized.severity ?? null },
    )],
  });
}

export function acknowledgeAlert(alert, options = {}) {
  const normalized = normalizeAlert(alert);
  if (['resolved', 'expired'].includes(normalized.state)) {
    throw new TypeError(`Cannot acknowledge an alert in the ${normalized.state} state.`);
  }
  const at = options.at ?? new Date().toISOString();
  return transition(normalized, 'acknowledged', at, options.actor, 'acknowledged', {
    acknowledgedAt: new Date(parseTimestamp(at)).toISOString(),
    acknowledgedBy: normalizeActor(options.actor),
    snoozedUntil: null,
  }, { note: options.note ?? null });
}

export function snoozeAlert(alert, until, options = {}) {
  const normalized = normalizeAlert(alert);
  if (['resolved', 'expired'].includes(normalized.state)) {
    throw new TypeError(`Cannot snooze an alert in the ${normalized.state} state.`);
  }
  const at = options.at ?? new Date().toISOString();
  const snoozedUntil = new Date(parseTimestamp(until, 'Snooze end')).toISOString();
  if (parseTimestamp(snoozedUntil) <= parseTimestamp(at)) {
    throw new TypeError('Snooze end must be after the transition time.');
  }
  return transition(normalized, 'snoozed', at, options.actor, 'snoozed', {
    snoozedUntil,
  }, { until: snoozedUntil, note: options.note ?? null });
}

export function resolveAlert(alert, options = {}) {
  const normalized = normalizeAlert(alert);
  if (normalized.state === 'expired') throw new TypeError('An expired alert cannot be resolved.');
  if (normalized.state === 'resolved') return normalized;
  const at = options.at ?? new Date().toISOString();
  return transition(normalized, 'resolved', at, options.actor, 'resolved', {
    resolvedAt: new Date(parseTimestamp(at)).toISOString(),
    snoozedUntil: null,
  }, { reason: options.reason ?? null });
}

export function reopenAlert(alert, options = {}) {
  const normalized = normalizeAlert(alert);
  if (!['resolved', 'expired'].includes(normalized.state)) {
    throw new TypeError('Only resolved or expired alerts can be reopened.');
  }
  return transition(normalized, 'active', options.at ?? new Date().toISOString(), options.actor, 'reopened', {
    resolvedAt: null,
    snoozedUntil: null,
    expiresAt: options.expiresAt
      ? new Date(parseTimestamp(options.expiresAt)).toISOString()
      : normalized.expiresAt,
  }, { reason: options.reason ?? null });
}

export function applyAlertClock(alert, now = new Date().toISOString()) {
  const normalized = normalizeAlert(alert);
  const timestamp = parseTimestamp(now);
  if (normalized.state === 'snoozed'
      && normalized.snoozedUntil
      && timestamp >= parseTimestamp(normalized.snoozedUntil)) {
    return transition(normalized, 'active', now, null, 'snooze_ended', { snoozedUntil: null });
  }
  if (!['resolved', 'expired'].includes(normalized.state)
      && normalized.expiresAt
      && timestamp >= parseTimestamp(normalized.expiresAt)) {
    return transition(normalized, 'expired', now, null, 'expired', { snoozedUntil: null });
  }
  return normalized;
}

export function mergeAlertOccurrence(existing, occurrence, options = {}) {
  const normalized = normalizeAlert(existing);
  assertObject(occurrence, 'Alert occurrence');
  const at = occurrence.triggeredAt ?? options.at ?? new Date().toISOString();
  if (String(occurrence.ruleId ?? '') !== String(normalized.ruleId ?? '')) {
    throw new TypeError('Only occurrences from the same rule can be merged.');
  }
  const state = normalized.state === 'resolved' || normalized.state === 'expired' ? 'active' : normalized.state;
  return transition(normalized, state, at, options.actor, 'repeated', {
    severity: occurrence.severity ?? normalized.severity,
    message: occurrence.message ?? normalized.message,
    lastTriggeredAt: new Date(parseTimestamp(at)).toISOString(),
    occurrenceCount: (normalized.occurrenceCount ?? 1) + 1,
    evidence: occurrence.evidence ?? normalized.evidence,
    resolvedAt: state === 'active' ? null : normalized.resolvedAt,
  }, { occurrenceId: occurrence.id ?? null });
}

export function processAlertCollection(alerts, now = new Date().toISOString()) {
  const processed = assertArray(alerts, 'Alerts').map((alert) => applyAlertClock(alert, now));
  return deepFreeze({
    alerts: processed,
    active: processed.filter((alert) => alert.state === 'active'),
    acknowledged: processed.filter((alert) => alert.state === 'acknowledged'),
    snoozed: processed.filter((alert) => alert.state === 'snoozed'),
    closed: processed.filter((alert) => ['resolved', 'expired'].includes(alert.state)),
  });
}

export const ALERT_STATES = STATES;

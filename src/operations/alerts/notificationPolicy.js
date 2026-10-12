import {
  assertArray,
  assertEnum,
  assertFiniteNumber,
  assertInteger,
  assertObject,
  deepFreeze,
  parseTimestamp,
} from '../core/validation';

const CHANNELS = Object.freeze(['in_app', 'push', 'email', 'sms', 'webhook']);
const SEVERITY_ORDER = Object.freeze({ info: 0, minor: 1, moderate: 2, severe: 3, extreme: 4 });

function minutesOfDay(timestamp, offsetMinutes) {
  const date = new Date(timestamp + offsetMinutes * 60_000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function withinQuietHours(timestamp, quietHours, offsetMinutes) {
  if (!quietHours?.enabled) return false;
  const current = minutesOfDay(timestamp, offsetMinutes);
  const start = assertInteger(quietHours.startsAtMinute ?? 1320, 'Quiet hours start', { minimum: 0, maximum: 1439 });
  const end = assertInteger(quietHours.endsAtMinute ?? 420, 'Quiet hours end', { minimum: 0, maximum: 1439 });
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function normalizeChannel(channel, index) {
  assertObject(channel, `Channel ${index + 1}`);
  return Object.freeze({
    type: assertEnum(channel.type, CHANNELS, `Channel ${index + 1} type`),
    enabled: channel.enabled !== false,
    minimumSeverity: assertEnum(
      channel.minimumSeverity ?? 'moderate',
      Object.keys(SEVERITY_ORDER),
      `Channel ${index + 1} minimum severity`,
    ),
    destination: channel.destination ?? null,
    categories: Array.isArray(channel.categories) ? channel.categories : null,
    batchWindowMinutes: assertFiniteNumber(
      channel.batchWindowMinutes ?? 0,
      `Channel ${index + 1} batch window`,
      { minimum: 0, maximum: 1440 },
    ),
  });
}

function severityAtLeast(actual, minimum) {
  return (SEVERITY_ORDER[actual] ?? 0) >= (SEVERITY_ORDER[minimum] ?? 0);
}

function recentDuplicate(alert, deliveries, windowMinutes, now) {
  return deliveries.find((delivery) => (
    delivery.ruleId === alert.ruleId
    && delivery.channel
    && now - parseTimestamp(delivery.sentAt ?? delivery.queuedAt) < windowMinutes * 60_000
  ));
}

export function planAlertNotifications(alert, inputPolicy = {}, context = {}) {
  assertObject(alert, 'Alert');
  const now = parseTimestamp(context.now ?? alert.triggeredAt ?? new Date().toISOString());
  const channels = assertArray(inputPolicy.channels ?? [{ type: 'in_app' }], 'Notification channels')
    .map(normalizeChannel);
  const offsetMinutes = Number.isFinite(context.timezoneOffsetMinutes) ? context.timezoneOffsetMinutes : 0;
  const quiet = withinQuietHours(now, inputPolicy.quietHours, offsetMinutes);
  const bypassSeverity = inputPolicy.quietHours?.bypassSeverity ?? 'severe';
  const duplicateWindowMinutes = assertFiniteNumber(
    inputPolicy.duplicateWindowMinutes ?? 60,
    'Duplicate window',
    { minimum: 0, maximum: 43_200 },
  );
  const priorDeliveries = Array.isArray(context.priorDeliveries) ? context.priorDeliveries : [];
  const decisions = channels.map((channel) => {
    const reasons = [];
    let send = channel.enabled;
    if (!channel.enabled) reasons.push('Channel is disabled.');
    if (send && !severityAtLeast(alert.severity, channel.minimumSeverity)) {
      send = false;
      reasons.push('Alert severity is below the channel threshold.');
    }
    if (send && channel.categories && !channel.categories.includes(alert.category)) {
      send = false;
      reasons.push('Alert category is not enabled for this channel.');
    }
    if (send && quiet && channel.type !== 'in_app' && !severityAtLeast(alert.severity, bypassSeverity)) {
      send = false;
      reasons.push('Quiet hours defer this alert.');
    }
    const duplicate = send
      ? recentDuplicate(alert, priorDeliveries.filter((item) => item.channel === channel.type), duplicateWindowMinutes, now)
      : null;
    if (duplicate) {
      send = false;
      reasons.push('An equivalent alert was delivered recently.');
    }
    if (send) reasons.push('Alert satisfies the channel policy.');
    return deepFreeze({
      channel: channel.type,
      destination: channel.destination,
      action: send ? (channel.batchWindowMinutes > 0 ? 'queue' : 'send') : (quiet ? 'defer' : 'skip'),
      scheduledAt: send && channel.batchWindowMinutes > 0
        ? new Date(now + channel.batchWindowMinutes * 60_000).toISOString()
        : new Date(now).toISOString(),
      reasons,
    });
  });
  return deepFreeze({
    alertId: alert.id,
    plannedAt: new Date(now).toISOString(),
    quietHoursActive: quiet,
    decisions,
    sendCount: decisions.filter((decision) => ['send', 'queue'].includes(decision.action)).length,
  });
}

export function batchNotifications(plans, options = {}) {
  const selected = assertArray(plans, 'Notification plans');
  const maximumBatch = assertInteger(options.maximumBatch ?? 50, 'Maximum batch size', { minimum: 1, maximum: 1000 });
  const entries = selected.flatMap((plan) => plan.decisions
    .filter((decision) => decision.action === 'queue')
    .map((decision) => ({
      alertId: plan.alertId,
      channel: decision.channel,
      destination: decision.destination,
      scheduledAt: decision.scheduledAt,
    })));
  const groups = new Map();
  entries.forEach((entry) => {
    const key = `${entry.channel}:${entry.destination ?? ''}:${entry.scheduledAt}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  return [...groups.entries()].flatMap(([key, items]) => {
    const batches = [];
    for (let index = 0; index < items.length; index += maximumBatch) {
      const part = items.slice(index, index + maximumBatch);
      batches.push(deepFreeze({
        id: `${key}:${Math.floor(index / maximumBatch)}`,
        channel: part[0].channel,
        destination: part[0].destination,
        scheduledAt: part[0].scheduledAt,
        alertIds: part.map((item) => item.alertId),
      }));
    }
    return batches;
  });
}

export function deliveryRecord(plan, decision, outcome, at = new Date().toISOString()) {
  const timestamp = new Date(parseTimestamp(at)).toISOString();
  return deepFreeze({
    alertId: plan.alertId,
    ruleId: outcome.ruleId ?? null,
    channel: decision.channel,
    destination: decision.destination,
    status: outcome.success ? 'sent' : 'failed',
    sentAt: outcome.success ? timestamp : null,
    failedAt: outcome.success ? null : timestamp,
    error: outcome.success ? null : outcome.error?.message ?? outcome.error ?? 'Delivery failed.',
    providerReference: outcome.reference ?? null,
  });
}

export const NOTIFICATION_CHANNELS = CHANNELS;

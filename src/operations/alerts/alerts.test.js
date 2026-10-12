import { describe, expect, it } from 'vitest';
import { ALERT_OPERATORS, ALERT_SEVERITIES, evaluateAlertRules, evaluateRulesAcrossForecast, summarizeAlertLoad } from './ruleEngine';
import {
  acknowledgeAlert,
  ALERT_STATES,
  applyAlertClock,
  createManagedAlert,
  mergeAlertOccurrence,
  processAlertCollection,
  reopenAlert,
  resolveAlert,
  snoozeAlert,
} from './lifecycle';
import { batchNotifications, deliveryRecord, NOTIFICATION_CHANNELS, planAlertNotifications } from './notificationPolicy';
import {
  createForecastWatch,
  evaluateForecastWatch,
  evaluateWatchCollection,
  pauseWatch,
  resumeWatch,
  watchProgress,
} from './watchEngine';

const NOW = '2026-06-01T12:00:00Z';
const LOCATION = { id: 'city', name: 'City', latitude: 1, longitude: 2 };

function rule(changes = {}) {
  return {
    id: 'heat',
    name: 'High heat',
    severity: 'severe',
    category: 'temperature',
    conditions: [{ field: 'temperatureC', operator: 'greater_than_or_equal', value: 35 }],
    message: 'Temperature reached {temperatureC} °C.',
    guidance: ['Stay hydrated.'],
    ...changes,
  };
}

function occurrence(changes = {}) {
  return {
    id: 'heat:1',
    ruleId: 'heat',
    name: 'High heat',
    severity: 'severe',
    category: 'temperature',
    triggeredAt: NOW,
    message: 'Hot weather.',
    ...changes,
  };
}

describe('alert rule engine', () => {
  it('exports supported operators', () => {
    expect(ALERT_OPERATORS).toContain('between');
    expect(ALERT_OPERATORS).toContain('changes_by');
  });

  it('exports severity levels in order', () => {
    expect(ALERT_SEVERITIES[0]).toBe('info');
    expect(ALERT_SEVERITIES.at(-1)).toBe('extreme');
  });

  it('matches greater-than conditions', () => {
    const result = evaluateAlertRules([rule()], { temperatureC: 36, observedAt: NOW });
    expect(result.alerts).toHaveLength(1);
  });

  it('does not match values below a threshold', () => {
    const result = evaluateAlertRules([rule()], { temperatureC: 30, observedAt: NOW });
    expect(result.alerts).toHaveLength(0);
  });

  it('interpolates alert messages', () => {
    const result = evaluateAlertRules([rule()], { temperatureC: 36, observedAt: NOW });
    expect(result.alerts[0].message).toBe('Temperature reached 36 °C.');
  });

  it('supports all-condition mode', () => {
    const result = evaluateAlertRules([rule({ conditions: [
      { field: 'temperatureC', operator: 'greater_than', value: 30 },
      { field: 'humidityPercent', operator: 'greater_than', value: 60 },
    ] })], { temperatureC: 35, humidityPercent: 50, observedAt: NOW });
    expect(result.alerts).toHaveLength(0);
  });

  it('supports any-condition mode', () => {
    const result = evaluateAlertRules([rule({
      mode: 'any',
      conditions: [
        { field: 'temperatureC', operator: 'greater_than', value: 30 },
        { field: 'humidityPercent', operator: 'greater_than', value: 60 },
      ],
    })], { temperatureC: 35, humidityPercent: 50, observedAt: NOW });
    expect(result.alerts).toHaveLength(1);
  });

  it('supports between conditions', () => {
    const result = evaluateAlertRules([rule({ conditions: [
      { field: 'temperatureC', operator: 'between', value: 20, secondValue: 30 },
    ] })], { temperatureC: 25, observedAt: NOW });
    expect(result.alerts).toHaveLength(1);
  });

  it('supports outside conditions', () => {
    const result = evaluateAlertRules([rule({ conditions: [
      { field: 'temperatureC', operator: 'outside', value: 10, secondValue: 30 },
    ] })], { temperatureC: 35, observedAt: NOW });
    expect(result.alerts).toHaveLength(1);
  });

  it('supports includes conditions', () => {
    const result = evaluateAlertRules([rule({ conditions: [
      { field: 'condition.description', operator: 'includes', value: 'storm' },
    ] })], { condition: { description: 'Heavy thunderstorm' }, observedAt: NOW });
    expect(result.alerts).toHaveLength(1);
  });

  it('supports change conditions', () => {
    const result = evaluateAlertRules([rule({ conditions: [
      { field: 'pressureHpa', operator: 'changes_by', value: 10 },
    ] })], { pressureHpa: 990, observedAt: NOW }, { previous: { pressureHpa: 1010 } });
    expect(result.alerts).toHaveLength(1);
  });

  it('can match missing fields explicitly', () => {
    const result = evaluateAlertRules([rule({ conditions: [
      { field: 'missing', operator: 'equal', value: 1, missingMatches: true },
    ] })], { observedAt: NOW });
    expect(result.alerts).toHaveLength(1);
  });

  it('honors active time ranges', () => {
    const result = evaluateAlertRules([rule({ activeFrom: '2026-06-02T00:00:00Z' })], { temperatureC: 40, observedAt: NOW });
    expect(result.evaluations[0].active).toBe(false);
  });

  it('suppresses alerts during cooldown', () => {
    const result = evaluateAlertRules([rule({ cooldownMinutes: 60 })], { temperatureC: 40, observedAt: NOW }, {
      priorAlerts: [{ ruleId: 'heat', triggeredAt: '2026-06-01T11:30:00Z' }],
    });
    expect(result.alerts).toHaveLength(0);
    expect(result.summary.suppressedCount).toBe(1);
  });

  it('evaluates forecast timelines', () => {
    const result = evaluateRulesAcrossForecast([rule()], [
      { forecastAt: NOW, temperatureC: 30 },
      { forecastAt: '2026-06-01T13:00:00Z', temperatureC: 36 },
    ]);
    expect(result.occurrences).toHaveLength(1);
    expect(result.windows).toHaveLength(1);
  });

  it('summarizes alert load', () => {
    const result = summarizeAlertLoad([occurrence(), occurrence({ id: 'two', severity: 'moderate' })]);
    expect(result.total).toBe(2);
    expect(result.bySeverity.severe).toBe(1);
  });
});

describe('alert lifecycle', () => {
  it('exports alert states', () => {
    expect(ALERT_STATES).toContain('snoozed');
  });

  it('creates managed active alerts', () => {
    const result = createManagedAlert(occurrence({ createdAt: NOW }));
    expect(result.state).toBe('active');
    expect(result.history[0].type).toBe('created');
  });

  it('acknowledges active alerts', () => {
    const alert = createManagedAlert(occurrence({ createdAt: NOW }));
    const result = acknowledgeAlert(alert, { at: '2026-06-01T12:05:00Z', actor: 'user' });
    expect(result.state).toBe('acknowledged');
    expect(result.acknowledgedBy.id).toBe('user');
  });

  it('snoozes active alerts', () => {
    const alert = createManagedAlert(occurrence({ createdAt: NOW }));
    const result = snoozeAlert(alert, '2026-06-01T13:00:00Z', { at: NOW });
    expect(result.state).toBe('snoozed');
  });

  it('rejects past snooze deadlines', () => {
    const alert = createManagedAlert(occurrence({ createdAt: NOW }));
    expect(() => snoozeAlert(alert, '2026-06-01T11:00:00Z', { at: NOW })).toThrow('after');
  });

  it('reactivates elapsed snoozes', () => {
    const alert = snoozeAlert(createManagedAlert(occurrence({ createdAt: NOW })), '2026-06-01T13:00:00Z', { at: NOW });
    expect(applyAlertClock(alert, '2026-06-01T13:01:00Z').state).toBe('active');
  });

  it('expires alerts', () => {
    const alert = createManagedAlert(occurrence({ createdAt: NOW, expiresAt: '2026-06-01T13:00:00Z' }));
    expect(applyAlertClock(alert, '2026-06-01T13:01:00Z').state).toBe('expired');
  });

  it('resolves alerts', () => {
    const alert = createManagedAlert(occurrence({ createdAt: NOW }));
    const result = resolveAlert(alert, { at: '2026-06-01T13:00:00Z', reason: 'Conditions ended' });
    expect(result.state).toBe('resolved');
  });

  it('reopens resolved alerts', () => {
    const alert = resolveAlert(createManagedAlert(occurrence({ createdAt: NOW })), { at: '2026-06-01T13:00:00Z' });
    expect(reopenAlert(alert, { at: '2026-06-01T14:00:00Z' }).state).toBe('active');
  });

  it('merges repeated occurrences', () => {
    const alert = createManagedAlert(occurrence({ createdAt: NOW }));
    const result = mergeAlertOccurrence(alert, occurrence({ id: 'new', triggeredAt: '2026-06-01T13:00:00Z' }));
    expect(result.occurrenceCount).toBe(2);
  });

  it('groups alert collections by state', () => {
    const active = createManagedAlert(occurrence({ createdAt: NOW }));
    const closed = resolveAlert(active, { at: '2026-06-01T13:00:00Z' });
    const result = processAlertCollection([active, closed], '2026-06-01T14:00:00Z');
    expect(result.active).toHaveLength(1);
    expect(result.closed).toHaveLength(1);
  });
});

describe('notification policy', () => {
  it('exports supported channels', () => {
    expect(NOTIFICATION_CHANNELS).toContain('push');
    expect(NOTIFICATION_CHANNELS).toContain('webhook');
  });

  it('plans in-app delivery', () => {
    const plan = planAlertNotifications(occurrence(), { channels: [{ type: 'in_app' }] }, { now: NOW });
    expect(plan.decisions[0].action).toBe('send');
  });

  it('skips disabled channels', () => {
    const plan = planAlertNotifications(occurrence(), { channels: [{ type: 'push', enabled: false }] }, { now: NOW });
    expect(plan.decisions[0].action).toBe('skip');
  });

  it('applies severity thresholds', () => {
    const plan = planAlertNotifications(occurrence({ severity: 'minor' }), {
      channels: [{ type: 'push', minimumSeverity: 'severe' }],
    }, { now: NOW });
    expect(plan.decisions[0].action).toBe('skip');
  });

  it('applies category filters', () => {
    const plan = planAlertNotifications(occurrence(), {
      channels: [{ type: 'push', categories: ['wind'] }],
    }, { now: NOW });
    expect(plan.decisions[0].action).toBe('skip');
  });

  it('defers alerts during quiet hours', () => {
    const plan = planAlertNotifications(occurrence({ severity: 'moderate' }), {
      quietHours: { enabled: true, startsAtMinute: 0, endsAtMinute: 1439, bypassSeverity: 'extreme' },
      channels: [{ type: 'push', minimumSeverity: 'minor' }],
    }, { now: NOW });
    expect(plan.decisions[0].action).toBe('defer');
  });

  it('allows severe alerts through quiet hours', () => {
    const plan = planAlertNotifications(occurrence({ severity: 'extreme' }), {
      quietHours: { enabled: true, startsAtMinute: 0, endsAtMinute: 1439, bypassSeverity: 'extreme' },
      channels: [{ type: 'push' }],
    }, { now: NOW });
    expect(plan.decisions[0].action).toBe('send');
  });

  it('suppresses recent duplicates', () => {
    const plan = planAlertNotifications(occurrence(), { channels: [{ type: 'push' }] }, {
      now: NOW,
      priorDeliveries: [{ ruleId: 'heat', channel: 'push', sentAt: '2026-06-01T11:30:00Z' }],
    });
    expect(plan.decisions[0].action).toBe('skip');
  });

  it('queues channels with batching windows', () => {
    const plan = planAlertNotifications(occurrence(), { channels: [{ type: 'email', batchWindowMinutes: 15 }] }, { now: NOW });
    expect(plan.decisions[0].action).toBe('queue');
  });

  it('groups queued notifications', () => {
    const plan = planAlertNotifications(occurrence(), { channels: [{ type: 'email', batchWindowMinutes: 15 }] }, { now: NOW });
    expect(batchNotifications([plan])).toHaveLength(1);
  });

  it('records delivery outcomes', () => {
    const plan = planAlertNotifications(occurrence(), { channels: [{ type: 'push' }] }, { now: NOW });
    const record = deliveryRecord(plan, plan.decisions[0], { success: true, ruleId: 'heat' }, NOW);
    expect(record.status).toBe('sent');
  });
});

describe('forecast watches', () => {
  function watch(changes = {}) {
    return createForecastWatch({
      id: 'watch-1',
      name: 'Heat watch',
      location: LOCATION,
      rules: [rule()],
      createdAt: NOW,
      startsAt: NOW,
      endsAt: '2026-06-02T12:00:00Z',
      ...changes,
    });
  }

  it('creates active watches', () => {
    expect(watch().state).toBe('active');
  });

  it('triggers matching watches', () => {
    const result = evaluateForecastWatch(watch(), { observedAt: NOW, temperatureC: 40 });
    expect(result.triggered).toBe(true);
    expect(result.watch.triggerCount).toBe(1);
  });

  it('does not trigger nonmatching watches', () => {
    expect(evaluateForecastWatch(watch(), { observedAt: NOW, temperatureC: 20 }).triggered).toBe(false);
  });

  it('completes one-shot watches', () => {
    const result = evaluateForecastWatch(watch({ repeatPolicy: 'once' }), { observedAt: NOW, temperatureC: 40 });
    expect(result.watch.state).toBe('completed');
  });

  it('expires elapsed watches', () => {
    const result = evaluateForecastWatch(watch(), { observedAt: '2026-06-03T00:00:00Z', temperatureC: 40 });
    expect(result.watch.state).toBe('expired');
  });

  it('pauses active watches', () => {
    expect(pauseWatch(watch(), NOW).state).toBe('paused');
  });

  it('skips paused watches', () => {
    const paused = pauseWatch(watch(), NOW);
    expect(evaluateForecastWatch(paused, { observedAt: NOW, temperatureC: 40 }).reason).toBe('paused');
  });

  it('resumes paused watches', () => {
    const paused = pauseWatch(watch(), NOW);
    expect(resumeWatch(paused, '2026-06-01T13:00:00Z').state).toBe('active');
  });

  it('evaluates watch collections', () => {
    const result = evaluateWatchCollection([watch()], { city: { observedAt: NOW, temperatureC: 40 } });
    expect(result.summary.triggered).toBe(1);
  });

  it('reports watch progress', () => {
    expect(watchProgress(watch(), '2026-06-02T00:00:00Z')).toBe(0.5);
  });
});

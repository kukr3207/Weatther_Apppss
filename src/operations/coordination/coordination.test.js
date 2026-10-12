import { describe, expect, it } from 'vitest';
import {
  appendAuditBatch,
  appendAuditEvent,
  exportAuditJournal,
  journalCheckpoint,
  queryAuditJournal,
  verifyAuditJournal,
} from './auditJournal';
import {
  acceptForecastHandoff,
  createForecastHandoff,
  expireForecastHandoff,
  handoffInbox,
  processHandoffClock,
  publishForecastHandoff,
  supersedeForecastHandoff,
  updateForecastHandoff,
} from './handoff';
import {
  addIncidentUpdate,
  assignIncidentAction,
  completeIncidentAction,
  createWeatherIncident,
  incidentSummary,
  transitionIncident,
} from './incidents';
import { assessProviderHealth, chooseHealthyProvider, providerCircuitDecision } from './serviceHealth';

const NOW = '2026-10-11T12:00:00Z';

describe('tamper-evident audit journal', () => {
  function event(id, changes = {}) {
    return {
      id,
      type: 'watch.created',
      actor: { id: 'user-1' },
      subject: { type: 'watch', id: 'watch-1' },
      occurredAt: NOW,
      data: { enabled: true },
      ...changes,
    };
  }

  it('appends chained events', () => {
    const first = appendAuditEvent([], event('one'));
    const second = appendAuditEvent(first.events, event('two', { occurredAt: '2026-10-11T12:01:00Z' }));
    expect(second.event.sequence).toBe(2);
    expect(second.event.previousHash).toBe(first.event.hash);
    expect(verifyAuditJournal(second.events).valid).toBe(true);
  });

  it('treats exact ids as idempotent', () => {
    const first = appendAuditEvent([], event('one'));
    const repeated = appendAuditEvent(first.events, event('one'));
    expect(repeated.appended).toBe(false);
    expect(repeated.events).toHaveLength(1);
  });

  it('rejects conflicting duplicate ids', () => {
    const first = appendAuditEvent([], event('one'));
    expect(() => appendAuditEvent(first.events, event('one', { data: { enabled: false } }))).toThrow('conflicts');
  });

  it('appends batches atomically in order', () => {
    const result = appendAuditBatch([], [
      event('one'),
      event('two', { occurredAt: '2026-10-11T12:01:00Z' }),
    ]);
    expect(result.appendedCount).toBe(2);
    expect(result.events.map((entry) => entry.sequence)).toEqual([1, 2]);
  });

  it('detects changed content', () => {
    const result = appendAuditEvent([], event('one'));
    const tampered = structuredClone(result.events);
    tampered[0].data.enabled = false;
    expect(() => verifyAuditJournal(tampered)).toThrow('invalid hash');
  });

  it('queries by type and subject', () => {
    const result = appendAuditBatch([], [
      event('one'),
      event('two', { type: 'watch.paused', occurredAt: '2026-10-11T12:01:00Z' }),
    ]);
    expect(queryAuditJournal(result.events, { types: ['watch.paused'], subjectId: 'watch-1' }).map((entry) => entry.id)).toEqual(['two']);
  });

  it('exports JSONL, JSON, and CSV', () => {
    const events = appendAuditEvent([], event('one')).events;
    expect(exportAuditJournal(events)).toContain('watch.created');
    expect(JSON.parse(exportAuditJournal(events, 'json'))).toHaveLength(1);
    expect(exportAuditJournal(events, 'csv')).toContain('sequence,id,type');
  });

  it('creates checkpoints from the journal head', () => {
    const events = appendAuditEvent([], event('one')).events;
    expect(journalCheckpoint(events)).toMatchObject({ sequence: 1, headHash: events[0].hash });
  });
});

describe('forecast handoffs', () => {
  function draft() {
    return createForecastHandoff({
      id: 'handoff-1',
      from: { id: 'day', name: 'Day shift' },
      to: { id: 'night', name: 'Night shift' },
      summary: 'Monitor the incoming storm.',
      createdAt: NOW,
      validUntil: '2026-10-12T00:00:00Z',
    });
  }

  it('creates editable drafts with history', () => {
    const result = draft();
    expect(result.state).toBe('draft');
    expect(result.history[0].type).toBe('created');
  });

  it('updates only draft handoffs', () => {
    const updated = updateForecastHandoff(draft(), { summary: 'Updated storm summary.' }, { at: '2026-10-11T12:10:00Z' });
    expect(updated.summary).toContain('Updated');
    expect(() => updateForecastHandoff(publishForecastHandoff(draft()), { summary: 'No' })).toThrow('draft');
  });

  it('publishes and accepts handoffs', () => {
    const ready = publishForecastHandoff(draft(), { at: '2026-10-11T12:05:00Z' });
    const accepted = acceptForecastHandoff(ready, { at: '2026-10-11T12:10:00Z', acknowledgement: 'Received' });
    expect(accepted.state).toBe('accepted');
    expect(accepted.acknowledgement).toBe('Received');
  });

  it('restricts acceptance to the recipient', () => {
    const ready = publishForecastHandoff(draft());
    expect(() => acceptForecastHandoff(ready, { actor: { id: 'someone-else' } })).toThrow('recipient');
  });

  it('expires elapsed handoffs', () => {
    const ready = publishForecastHandoff(draft());
    expect(processHandoffClock([ready], '2026-10-12T01:00:00Z')[0].state).toBe('expired');
    expect(expireForecastHandoff(ready).state).toBe('expired');
  });

  it('supersedes active handoffs', () => {
    expect(supersedeForecastHandoff(draft(), 'handoff-2').supersededBy).toBe('handoff-2');
  });

  it('builds recipient inboxes', () => {
    const ready = publishForecastHandoff(draft());
    expect(handoffInbox([ready], 'night')).toHaveLength(1);
    expect(handoffInbox([ready], 'day')).toEqual([]);
  });
});

describe('weather incident lifecycle', () => {
  function incident() {
    return createWeatherIncident({
      id: 'incident-1', title: 'Forecast provider unavailable', severity: 'major', commander: { id: 'lead' },
      affectedLocations: [{ id: 'blr' }], alertIds: ['alert-1'],
    }, { now: NOW });
  }

  it('opens incidents with timeline entries', () => {
    expect(incident()).toMatchObject({ state: 'open', severity: 'major' });
    expect(incident().timeline).toHaveLength(1);
  });

  it('adds chronological updates', () => {
    const updated = addIncidentUpdate(incident(), 'Fallback provider enabled.', { at: '2026-10-11T12:05:00Z' });
    expect(updated.timeline.at(-1).message).toContain('Fallback');
  });

  it('assigns and completes actions', () => {
    const assigned = assignIncidentAction(incident(), { id: 'check', title: 'Check provider status', owner: { id: 'analyst' } }, { at: '2026-10-11T12:05:00Z' });
    const completed = completeIncidentAction(assigned, 'check', { at: '2026-10-11T12:10:00Z' });
    expect(completed.actions[0].state).toBe('completed');
    expect(incidentSummary(completed).completedActionCount).toBe(1);
  });

  it('enforces valid state transitions', () => {
    const monitoring = transitionIncident(incident(), 'monitoring');
    const resolved = transitionIncident(monitoring, 'resolved');
    const closed = transitionIncident(resolved, 'closed');
    expect(closed.state).toBe('closed');
    expect(() => transitionIncident(closed, 'open')).toThrow('Cannot move');
  });

  it('summarizes affected scope', () => {
    expect(incidentSummary(incident())).toMatchObject({ affectedLocationCount: 1, alertCount: 1, openActionCount: 0 });
  });
});

describe('provider service health', () => {
  const provider = { id: 'primary', name: 'Primary provider' };

  it('assesses healthy samples', () => {
    const result = assessProviderHealth(provider, [
      { occurredAt: '2026-10-11T11:55:00Z', success: true, latencyMs: 100 },
      { occurredAt: '2026-10-11T11:56:00Z', success: true, latencyMs: 200 },
    ], { now: NOW });
    expect(result.status).toBe('healthy');
    expect(result.successRate).toBe(1);
  });

  it('detects unavailable providers', () => {
    const result = assessProviderHealth(provider, [
      { occurredAt: '2026-10-11T11:55:00Z', success: false, latencyMs: 1000 },
      { occurredAt: '2026-10-11T11:56:00Z', success: false, latencyMs: 1000 },
    ], { now: NOW });
    expect(['unhealthy', 'unavailable']).toContain(result.status);
  });

  it('chooses the healthiest provider', () => {
    const reports = [
      { provider: { id: 'bad' }, status: 'unhealthy', score: 20 },
      { provider: { id: 'good' }, status: 'healthy', score: 95 },
    ];
    expect(chooseHealthyProvider(reports).provider.id).toBe('good');
  });

  it('opens circuits for failed providers', () => {
    const report = { provider: { id: 'bad' }, status: 'unhealthy', score: 10 };
    expect(providerCircuitDecision(report, { failures: 5 }).state).toBe('open');
  });
});

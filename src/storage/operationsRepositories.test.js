import { describe, expect, it } from 'vitest';
import { createForecastHandoffRepository } from './forecastHandoffRepository';
import { createForecastWatchRepository } from './forecastWatchRepository';
import { createPackingTripRepository } from './packingTripRepository';
import { createVersionedCollectionRepository } from './versionedCollectionRepository';
import { createWeatherIncidentRepository } from './weatherIncidentRepository';

function memoryStore() {
  const values = new Map();
  return {
    get(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : structuredClone(fallback);
    },
    set(key, value) {
      values.set(key, structuredClone(value));
      return true;
    },
    inspect(key) {
      return structuredClone(values.get(key));
    },
  };
}

function clock() {
  let timestamp = Date.parse('2026-10-11T12:00:00Z');
  return () => {
    const value = new Date(timestamp).toISOString();
    timestamp += 1000;
    return value;
  };
}

describe('versioned collection repository', () => {
  function repository(options = {}) {
    return createVersionedCollectionRepository(memoryStore(), {
      key: 'records',
      capacity: 3,
      clock: clock(),
      ...options,
    });
  }

  it('requires a JSON store', () => {
    expect(() => createVersionedCollectionRepository(null, { key: 'records' })).toThrow('JSON store');
  });

  it('saves new records with metadata', () => {
    const repo = repository();
    const saved = repo.save({ id: 'a', value: 1 });
    expect(saved).toMatchObject({ id: 'a', value: 1, revision: 1 });
    expect(saved.createdAt).toBe('2026-10-11T12:00:00.000Z');
    expect(repo.get('a')).toEqual(saved);
  });

  it('returns defensive record copies', () => {
    const repo = repository();
    repo.save({ id: 'a', nested: { value: 1 } });
    const read = repo.get('a');
    read.nested.value = 99;
    expect(repo.get('a').nested.value).toBe(1);
  });

  it('increments revisions on update', () => {
    const repo = repository();
    repo.save({ id: 'a', value: 1 });
    const updated = repo.save({ id: 'a', value: 2 }, { expectedRevision: 1 });
    expect(updated.revision).toBe(2);
    expect(updated.createdAt).not.toBe(updated.updatedAt);
  });

  it('rejects stale expected revisions', () => {
    const repo = repository();
    repo.save({ id: 'a' });
    expect(() => repo.save({ id: 'a' }, { expectedRevision: 0 })).toThrow('changed since');
  });

  it('filters and custom-sorts listings', () => {
    const repo = repository();
    repo.save({ id: 'a', score: 2 });
    repo.save({ id: 'b', score: 1 });
    const result = repo.list({ filter: (record) => record.score > 0, sort: (a, b) => a.score - b.score });
    expect(result.map((record) => record.id)).toEqual(['b', 'a']);
  });

  it('removes records with tombstones', () => {
    const repo = repository();
    repo.save({ id: 'a' });
    expect(repo.remove('a', { reason: 'test' })).toBe(true);
    expect(repo.get('a')).toBeNull();
    expect(repo.metadata()).toMatchObject({ recordCount: 0, tombstoneCount: 1, revision: 2 });
  });

  it('returns false for absent removals', () => {
    expect(repository().remove('missing')).toBe(false);
  });

  it('evicts oldest updates when capacity is reached', () => {
    const repo = repository();
    repo.save({ id: 'a' });
    repo.save({ id: 'b' });
    repo.save({ id: 'c' });
    repo.save({ id: 'd' });
    expect(repo.list()).toHaveLength(3);
    expect(repo.get('a')).toBeNull();
    expect(repo.metadata().tombstoneCount).toBe(1);
  });

  it('replaces a whole collection atomically', () => {
    const repo = repository();
    repo.save({ id: 'old' });
    const records = repo.replace([{ id: 'a' }, { id: 'b' }]);
    expect(records.map((record) => record.id)).toEqual(['a', 'b']);
    expect(repo.get('old')).toBeNull();
  });

  it('rejects duplicate replacement ids', () => {
    expect(() => repository().replace([{ id: 'a' }, { id: 'a' }])).toThrow('duplicated');
  });

  it('rejects replacements above capacity', () => {
    expect(() => repository().replace([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])).toThrow('At most');
  });

  it('clears records and optionally retains tombstones', () => {
    const repo = repository();
    repo.save({ id: 'a' });
    repo.clear({ keepTombstones: true });
    expect(repo.metadata()).toMatchObject({ recordCount: 0, tombstoneCount: 1 });
  });

  it('migrates old envelopes', () => {
    const store = memoryStore();
    store.set('records', { schemaVersion: 1, revision: 2, values: [{ id: 'a' }] });
    const repo = createVersionedCollectionRepository(store, {
      key: 'records', schemaVersion: 2,
      migrate: (envelope) => ({ ...envelope, schemaVersion: 2, records: envelope.values }),
    });
    expect(repo.get('a').id).toBe('a');
    expect(repo.metadata().schemaVersion).toBe(2);
  });
});

describe('forecast watch repository', () => {
  function watch(id = 'watch-1', changes = {}) {
    return {
      id,
      name: 'Heat watch',
      location: { id: 'blr', name: 'Bengaluru' },
      rules: [{ id: 'heat' }],
      state: 'active',
      ...changes,
    };
  }

  it('lists active and location-specific watches', () => {
    const repo = createForecastWatchRepository(memoryStore(), { clock: clock() });
    repo.save(watch('active'));
    repo.save(watch('paused', { state: 'paused', location: { id: 'del' } }));
    expect(repo.active().map((entry) => entry.id)).toEqual(['active']);
    expect(repo.forLocation('del').map((entry) => entry.id)).toEqual(['paused']);
  });

  it('records evaluation state and counts', () => {
    const repo = createForecastWatchRepository(memoryStore(), { clock: clock() });
    repo.save(watch());
    const updated = repo.recordEvaluation('watch-1', {
      watch: { state: 'completed', triggerCount: 1, lastEvaluatedAt: '2026-10-11T13:00:00Z' },
    });
    expect(updated).toMatchObject({ state: 'completed', triggerCount: 1, revision: 2 });
  });

  it('validates required watch fields', () => {
    const repo = createForecastWatchRepository(memoryStore());
    expect(() => repo.save({ id: 'bad', name: '', location: { id: 'x' }, rules: [{}] })).toThrow('name');
    expect(() => repo.save({ id: 'bad', name: 'Bad', location: { id: 'x' }, rules: [] })).toThrow('at least one');
  });
});

describe('weather incident repository', () => {
  function incident(id, changes = {}) {
    return { id, title: `Incident ${id}`, commander: { id: 'owner' }, severity: 'moderate', state: 'open', ...changes };
  }

  it('sorts active incidents by severity', () => {
    const repo = createWeatherIncidentRepository(memoryStore(), { clock: clock() });
    repo.save(incident('minor', { severity: 'minor' }));
    repo.save(incident('critical', { severity: 'critical' }));
    expect(repo.active().map((entry) => entry.id)).toEqual(['critical', 'minor']);
  });

  it('finds incidents by alert and location', () => {
    const repo = createWeatherIncidentRepository(memoryStore(), { clock: clock() });
    repo.save(incident('one', { alertIds: ['alert-1'], affectedLocations: [{ id: 'blr' }] }));
    expect(repo.forAlert('alert-1')).toHaveLength(1);
    expect(repo.forLocation('blr')).toHaveLength(1);
  });

  it('deduplicates alert ids', () => {
    const repo = createWeatherIncidentRepository(memoryStore(), { clock: clock() });
    expect(repo.save(incident('one', { alertIds: ['a', 'a'] })).alertIds).toEqual(['a']);
  });
});

describe('handoff and packing repositories', () => {
  it('maintains handoff inboxes and outboxes', () => {
    const repo = createForecastHandoffRepository(memoryStore(), { clock: clock() });
    repo.save({ id: 'h-1', from: { id: 'day' }, to: { id: 'night' }, summary: 'Storm watch', state: 'ready' });
    expect(repo.inbox('night')).toHaveLength(1);
    expect(repo.outbox('day')).toHaveLength(1);
    expect(repo.inbox('day')).toEqual([]);
  });

  it('hides accepted handoffs from the open inbox', () => {
    const repo = createForecastHandoffRepository(memoryStore(), { clock: clock() });
    repo.save({ id: 'h-1', from: { id: 'day' }, to: { id: 'night' }, summary: 'Storm', state: 'accepted' });
    expect(repo.inbox('night')).toEqual([]);
    expect(repo.inbox('night', true)).toHaveLength(1);
  });

  it('lists upcoming packing trips', () => {
    const repo = createPackingTripRepository(memoryStore(), { clock: clock() });
    repo.save({
      id: 'trip', name: 'Coast', location: { id: 'goa' },
      startsAt: '2026-10-12T00:00:00Z', endsAt: '2026-10-15T00:00:00Z', items: [],
    });
    expect(repo.upcoming('2026-10-11T00:00:00Z')).toHaveLength(1);
    expect(repo.upcoming('2026-10-16T00:00:00Z')).toEqual([]);
  });

  it('updates individual packing items', () => {
    const repo = createPackingTripRepository(memoryStore(), { clock: clock() });
    repo.save({
      id: 'trip', name: 'Coast', location: { id: 'goa' },
      startsAt: '2026-10-12T00:00:00Z', endsAt: '2026-10-15T00:00:00Z',
      items: [{ id: 'umbrella', packed: false }, { id: 'water', packed: false }],
    });
    const updated = repo.setItemPacked('trip', 'umbrella', true);
    expect(updated.items.find((item) => item.id === 'umbrella').packed).toBe(true);
    expect(updated.items.find((item) => item.id === 'water').packed).toBe(false);
  });

  it('rejects invalid trip windows', () => {
    const repo = createPackingTripRepository(memoryStore());
    expect(() => repo.save({
      id: 'trip', name: 'Invalid', location: { id: 'x' },
      startsAt: '2026-10-15T00:00:00Z', endsAt: '2026-10-12T00:00:00Z',
    })).toThrow('after');
  });
});

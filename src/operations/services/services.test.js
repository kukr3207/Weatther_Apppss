import { describe, expect, it, vi } from 'vitest';
import {
  conditionalRequestHeaders,
  createCacheEntry,
  createWeatherCacheKey,
  enforceCacheCapacity,
  evaluateCacheEntry,
  refreshCacheEntry,
} from './cachePolicy';
import { enqueueOfflineOperation, offlineQueueSummary, replayOfflineQueue } from './offlineQueue';
import {
  createProviderAdapter,
  mergeProviderMetadata,
  normalizeCurrentObservation,
  normalizeForecastItem,
  normalizeForecastResponse,
  normalizeProviderLocation,
} from './providerAdapter';
import {
  CoordinatedRequestError,
  createRequestDeduplicator,
  providerRequestKey,
  requestFreshness,
} from './requestCoordinator';

describe('weather cache policy', () => {
  const STORED_AT = '2026-10-11T12:00:00Z';

  it('creates stable keys independent of parameter ordering', () => {
    const location = { id: 'blr' };
    expect(createWeatherCacheKey('forecast', location, { days: 5, units: 'metric' }))
      .toBe(createWeatherCacheKey('forecast', location, { units: 'metric', days: 5 }));
  });

  it('uses coordinates when location ids are absent', () => {
    expect(createWeatherCacheKey('current', { latitude: 12, longitude: 77 })).toContain('12,77');
  });

  it('creates immutable cache entries', () => {
    const entry = createCacheEntry({ temperatureC: 28 }, { providerId: 'a', etag: 'v1' }, STORED_AT);
    expect(entry).toMatchObject({ storedAt: '2026-10-11T12:00:00.000Z', providerId: 'a', etag: 'v1' });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('classifies cache misses', () => {
    expect(evaluateCacheEntry(null).status).toBe('miss');
  });

  it('classifies fresh entries', () => {
    const entry = createCacheEntry({}, {}, STORED_AT);
    expect(evaluateCacheEntry(entry, { freshSeconds: 600 }, '2026-10-11T12:05:00Z')).toMatchObject({
      status: 'fresh', usable: true, revalidate: false,
    });
  });

  it('allows stale-while-revalidate entries online', () => {
    const entry = createCacheEntry({}, {}, STORED_AT);
    expect(evaluateCacheEntry(entry, { freshSeconds: 60, staleSeconds: 600 }, '2026-10-11T12:05:00Z')).toMatchObject({
      status: 'stale', usable: true, revalidate: true,
    });
  });

  it('extends offline cache use', () => {
    const entry = createCacheEntry({}, {}, STORED_AT);
    expect(evaluateCacheEntry(entry, {
      freshSeconds: 60, staleSeconds: 120, offlineSeconds: 3600, online: false,
    }, '2026-10-11T12:30:00Z').status).toBe('offline_stale');
  });

  it('expires entries outside policy', () => {
    const entry = createCacheEntry({}, {}, STORED_AT);
    expect(evaluateCacheEntry(entry, { freshSeconds: 60, staleSeconds: 120 }, '2026-10-11T13:00:00Z').status).toBe('expired');
  });

  it('builds conditional request headers', () => {
    expect(conditionalRequestHeaders({ etag: 'abc', lastModified: 'yesterday' })).toEqual({
      'If-None-Match': 'abc', 'If-Modified-Since': 'yesterday',
    });
  });

  it('refreshes cache metadata without replacing value', () => {
    const entry = createCacheEntry({ value: 1 }, { etag: 'old' }, STORED_AT);
    const updated = refreshCacheEntry(entry, { etag: 'new' }, '2026-10-11T13:00:00Z');
    expect(updated.value).toEqual({ value: 1 });
    expect(updated.etag).toBe('new');
  });

  it('evicts oldest cache entries by count', () => {
    const entries = {
      old: createCacheEntry({}, {}, '2026-10-11T10:00:00Z'),
      middle: createCacheEntry({}, {}, '2026-10-11T11:00:00Z'),
      newest: createCacheEntry({}, {}, '2026-10-11T12:00:00Z'),
    };
    const result = enforceCacheCapacity(entries, { maximumEntries: 2 });
    expect(Object.keys(result.retained)).toEqual(['newest', 'middle']);
    expect(result.evicted).toEqual(['old']);
  });
});

describe('offline mutation queue', () => {
  function operation(changes = {}) {
    return {
      id: 'op-1', type: 'update', entityType: 'watch', entityId: 'watch-1',
      payload: { active: true }, queuedAt: '2026-10-11T12:00:00Z', ...changes,
    };
  }

  it('appends operations', () => {
    expect(enqueueOfflineOperation([], operation())).toHaveLength(1);
  });

  it('treats exact operation ids as idempotent', () => {
    const queue = enqueueOfflineOperation([], operation());
    expect(enqueueOfflineOperation(queue, operation())).toEqual(queue);
  });

  it('rejects conflicting reuse of an operation id', () => {
    const queue = enqueueOfflineOperation([], operation());
    expect(() => enqueueOfflineOperation(queue, operation({ payload: { active: false } }))).toThrow('conflicts');
  });

  it('coalesces operations for the same entity', () => {
    const queue = enqueueOfflineOperation([], operation());
    const result = enqueueOfflineOperation(queue, operation({ id: 'op-2', payload: { active: false } }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('op-2');
  });

  it('can retain same-entity operations', () => {
    const queue = enqueueOfflineOperation([], operation());
    expect(enqueueOfflineOperation(queue, operation({ id: 'op-2' }), { coalesce: false })).toHaveLength(2);
  });

  it('enforces queue capacity', () => {
    const queue = enqueueOfflineOperation([], operation());
    expect(() => enqueueOfflineOperation(queue, operation({ id: 'op-2', entityId: 'watch-2' }), { maximum: 1 })).toThrow('capacity');
  });

  it('replays successful operations', async () => {
    const result = await replayOfflineQueue([operation()], async (entry) => ({ saved: entry.entityId }));
    expect(result.completed).toHaveLength(1);
    expect(result.remaining).toEqual([]);
  });

  it('retains retryable failures', async () => {
    const result = await replayOfflineQueue([operation()], async () => { throw new Error('offline'); }, {
      now: '2026-10-11T13:00:00Z', maximumAttempts: 3,
    });
    expect(result.remaining[0]).toMatchObject({ attempts: 1, lastError: 'offline' });
  });

  it('moves exhausted retries to failed', async () => {
    const result = await replayOfflineQueue([operation({ attempts: 1 })], async () => { throw new Error('offline'); }, { maximumAttempts: 2 });
    expect(result.failed).toHaveLength(1);
    expect(result.remaining).toEqual([]);
  });

  it('summarizes queue types and attempts', () => {
    const result = offlineQueueSummary([
      operation({ attempts: 2 }),
      operation({ id: 'op-2', type: 'delete', entityId: 'watch-2', queuedAt: '2026-10-11T13:00:00Z' }),
    ]);
    expect(result).toMatchObject({ count: 2, failedAttempts: 2, byType: { update: 1, delete: 1 } });
  });
});

describe('provider normalization', () => {
  it('normalizes provider locations', () => {
    const result = normalizeProviderLocation({ id: 1, name: 'Bengaluru', country: 'IN', coord: { lat: 12.97, lon: 77.59 } }, 'provider');
    expect(result).toMatchObject({ name: 'Bengaluru', latitude: 12.97, longitude: 77.59, providerId: 'provider' });
  });

  it('normalizes current observations', () => {
    const result = normalizeCurrentObservation({
      dt: 1_728_648_000,
      main: { temp: 28, feels_like: 30, humidity: 70, pressure: 1012 },
      wind: { speed: 4, deg: 180 },
      weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
      visibility: 10000,
    }, { providerId: 'openweather' });
    expect(result).toMatchObject({ temperatureC: 28, humidityPercent: 70, providerId: 'openweather' });
    expect(result.condition.description).toBe('clear sky');
  });

  it('normalizes forecast items', () => {
    const result = normalizeForecastItem({
      dt_txt: '2026-10-11 12:00:00', main: { temp: 25 }, pop: 0.5, rain: { '3h': 2 }, wind: { speed: 5 },
    });
    expect(result.temperatureC).toBe(25);
    expect(result.precipitationProbability).toBe(0.5);
    expect(result.rainMm).toBe(2);
  });

  it('normalizes complete forecast responses', () => {
    const result = normalizeForecastResponse({
      city: { id: 1, name: 'Pune', country: 'IN', coord: { lat: 18.5, lon: 73.8 } },
      list: [{ dt: 1_728_648_000, main: { temp: 25 } }],
    }, { providerId: 'a' });
    expect(result.location.name).toBe('Pune');
    expect(result.items).toHaveLength(1);
  });

  it('creates provider adapters with request hooks', async () => {
    const request = vi.fn(async () => ({ temperature: 20 }));
    const adapter = createProviderAdapter({
      id: 'demo', name: 'Demo', request,
      current: { path: '/current', normalize: (value) => ({ temperatureC: value.temperature }) },
    });
    const result = await adapter.current({ latitude: 1, longitude: 2 });
    expect(request).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ temperatureC: 20, providerId: 'demo' });
  });

  it('merges provider metadata', () => {
    expect(mergeProviderMetadata({ value: 1 }, { providerId: 'a', fetchedAt: 'now' })).toEqual({
      value: 1, providerMetadata: { providerId: 'a', fetchedAt: 'now' },
    });
  });
});

describe('request coordination', () => {
  it('creates stable provider request keys', () => {
    expect(providerRequestKey('a', 'forecast', { latitude: 1, days: 5 }))
      .toBe(providerRequestKey('a', 'forecast', { days: 5, latitude: 1 }));
  });

  it('deduplicates concurrent identical requests', async () => {
    const coordinator = createRequestDeduplicator();
    const request = vi.fn(async () => 'result');
    const [first, second] = await Promise.all([
      coordinator.run('same', request),
      coordinator.run('same', request),
    ]);
    expect(first).toBe('result');
    expect(second).toBe('result');
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not deduplicate different keys', async () => {
    const coordinator = createRequestDeduplicator();
    const request = vi.fn(async () => 'result');
    await Promise.all([coordinator.run('a', request), coordinator.run('b', request)]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('clears completed in-flight requests', async () => {
    const coordinator = createRequestDeduplicator();
    await coordinator.run('a', async () => 1);
    expect(coordinator.size).toBe(0);
  });

  it('reports response freshness', () => {
    const result = requestFreshness({ fetchedAt: '2026-10-11T11:55:00Z' }, '2026-10-11T12:00:00Z');
    expect(result.ageSeconds).toBe(300);
    expect(result.stale).toBe(false);
  });

  it('exposes coordinated request errors', () => {
    const error = new CoordinatedRequestError('timeout', 'Timed out', { key: 'a' });
    expect(error).toMatchObject({ name: 'CoordinatedRequestError', code: 'timeout', details: { key: 'a' } });
  });
});

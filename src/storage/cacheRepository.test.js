import { describe, expect, test, vi } from 'vitest';
import { createCacheRepository } from './cacheRepository';

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    get: vi.fn((key, fallback) => key in data ? data[key] : fallback),
    set: vi.fn((key, value) => { data[key] = value; return true; }),
    remove: vi.fn((key) => { delete data[key]; return true; }),
    data,
  };
}

describe('cache repository', () => {
  test('writes and reads fresh entries', () => {
    const now = new Date('2024-03-15T12:00:00Z');
    const repository = createCacheRepository(memoryStore(), { now: () => now });
    repository.put('current:1', { temperatureC: 20 }, { freshMinutes: 10, staleMinutes: 60 });
    expect(repository.get('current:1')).toMatchObject({ state: 'fresh', value: { temperatureC: 20 } });
  });

  test('returns stale entries inside their stale window', () => {
    let now = new Date('2024-03-15T12:00:00Z');
    const repository = createCacheRepository(memoryStore(), { now: () => now });
    repository.put('forecast:1', { items: [] }, { freshMinutes: 10, staleMinutes: 60 });
    now = new Date('2024-03-15T12:20:00Z');
    expect(repository.get('forecast:1').state).toBe('stale');
    expect(repository.get('forecast:1', { allowStale: false })).toBeNull();
  });

  test('removes entries beyond their stale window', () => {
    let now = new Date('2024-03-15T12:00:00Z');
    const repository = createCacheRepository(memoryStore(), { now: () => now });
    repository.put('forecast:1', {}, { freshMinutes: 10, staleMinutes: 20 });
    now = new Date('2024-03-15T13:00:00Z');
    expect(repository.get('forecast:1')).toBeNull();
    expect(repository.list()).toHaveLength(0);
  });

  test('replaces existing keys instead of duplicating them', () => {
    const repository = createCacheRepository(memoryStore(), { now: () => new Date('2024-03-15T12:00:00Z') });
    repository.put('current:1', { value: 1 });
    repository.put('current:1', { value: 2 });
    expect(repository.list()).toHaveLength(1);
    expect(repository.get('current:1').value).toEqual({ value: 2 });
  });

  test('reports fresh, stale, and expired counts', () => {
    const repository = createCacheRepository(memoryStore(), { now: () => new Date('2024-03-15T12:00:00Z') });
    repository.put('current:1', {}, { freshMinutes: 10, staleMinutes: 20 });
    expect(repository.stats()).toEqual({ total: 1, fresh: 1, stale: 0, expired: 0 });
  });

  test('clears all cached records', () => {
    const store = memoryStore();
    const repository = createCacheRepository(store, { now: () => new Date('2024-03-15T12:00:00Z') });
    repository.put('current:1', {});
    expect(repository.clear()).toEqual([]);
    expect(store.remove).toHaveBeenCalledWith('weather-cache.v2');
  });
});

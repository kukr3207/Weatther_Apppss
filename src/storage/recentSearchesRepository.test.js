import { describe, expect, test, vi } from 'vitest';
import { createRecentSearchesRepository } from './recentSearchesRepository';

function storeWith(initial = []) {
  let value = initial;
  return {
    get: vi.fn(() => value),
    set: vi.fn((_key, next) => { value = next; return true; }),
    remove: vi.fn(() => { value = []; return true; }),
  };
}

const london = { name: 'London', country: 'GB', latitude: 51.5, longitude: -0.12 };

describe('recent searches repository', () => {
  test('records searches with a deterministic timestamp', () => {
    const repository = createRecentSearchesRepository(storeWith(), {
      now: () => new Date('2024-03-15T10:00:00.000Z'),
    });
    expect(repository.record(london)[0]).toEqual({
      ...london,
      id: '51.5,-0.12',
      state: null,
      searchedAt: '2024-03-15T10:00:00.000Z',
    });
  });

  test('moves a repeated location to the front', () => {
    const repository = createRecentSearchesRepository(storeWith());
    repository.record(london);
    repository.record({ name: 'Paris', country: 'FR', latitude: 48.86, longitude: 2.35 });
    repository.record(london);
    expect(repository.list().map((entry) => entry.name)).toEqual(['London', 'Paris']);
  });

  test('limits and clears history', () => {
    const store = storeWith();
    const repository = createRecentSearchesRepository(store, { limit: 1 });
    repository.record(london);
    repository.record({ name: 'Paris', country: 'FR', latitude: 48.86, longitude: 2.35 });
    expect(repository.list()).toHaveLength(1);
    expect(repository.clear()).toEqual([]);
    expect(store.remove).toHaveBeenCalled();
  });
});

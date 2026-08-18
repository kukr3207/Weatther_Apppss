import { describe, expect, test, vi } from 'vitest';
import { createFavoritesRepository } from './favoritesRepository';

function storeWith(initial = []) {
  let value = initial;
  return {
    get: vi.fn((_key, fallback) => value ?? fallback),
    set: vi.fn((_key, next) => { value = next; return true; }),
  };
}

const paris = { name: 'Paris', country: 'FR', latitude: 48.86, longitude: 2.35 };

describe('favorites repository', () => {
  test('adds normalized locations newest first', () => {
    const store = storeWith();
    const favorites = createFavoritesRepository(store);
    expect(favorites.add({ ...paris, state: '  Île-de-France ' })).toEqual([
      { ...paris, id: '48.86,2.35', state: 'Île-de-France' },
    ]);
  });

  test('does not add the same coordinates twice', () => {
    const repository = createFavoritesRepository(storeWith());
    repository.add(paris);
    repository.add({ ...paris, name: 'PARIS' });
    expect(repository.list()).toHaveLength(1);
    expect(repository.has(paris)).toBe(true);
  });

  test('removes favorites by stable location ID', () => {
    const repository = createFavoritesRepository(storeWith());
    repository.add(paris);
    expect(repository.remove('48.86,2.35')).toEqual([]);
  });

  test('enforces the configured capacity', () => {
    const repository = createFavoritesRepository(storeWith(), { limit: 2 });
    repository.add(paris);
    repository.add({ name: 'London', country: 'GB', latitude: 51.5, longitude: -0.12 });
    repository.add({ name: 'Delhi', country: 'IN', latitude: 28.61, longitude: 77.21 });
    expect(repository.list().map((item) => item.name)).toEqual(['Delhi', 'London']);
  });

  test('rejects incomplete locations', () => {
    const repository = createFavoritesRepository(storeWith());
    expect(() => repository.add({ name: 'Unknown' })).toThrow(TypeError);
  });
});

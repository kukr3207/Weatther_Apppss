import { describe, expect, test, vi } from 'vitest';
import { createJsonStore } from './jsonStore';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

describe('JSON store', () => {
  test('namespaces and round-trips values', () => {
    const storage = memoryStorage();
    const store = createJsonStore({ storage, namespace: 'test' });
    expect(store.set('settings', { units: 'metric' })).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith('test:settings', '{"units":"metric"}');
    expect(store.get('settings', null)).toEqual({ units: 'metric' });
  });

  test('returns the fallback for missing or malformed data', () => {
    const storage = memoryStorage();
    const store = createJsonStore({ storage });
    expect(store.get('missing', [])).toEqual([]);
    storage.getItem.mockReturnValueOnce('{');
    expect(store.get('broken', { safe: true })).toEqual({ safe: true });
  });

  test('contains storage access failures', () => {
    const error = new Error('blocked');
    const storage = {
      getItem: vi.fn(() => { throw error; }),
      setItem: vi.fn(() => { throw error; }),
      removeItem: vi.fn(() => { throw error; }),
    };
    const store = createJsonStore({ storage });
    expect(store.get('key', 'fallback')).toBe('fallback');
    expect(store.set('key', 1)).toBe(false);
    expect(store.remove('key')).toBe(false);
  });
});

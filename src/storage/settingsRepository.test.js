import { describe, expect, test, vi } from 'vitest';
import { createSettingsRepository, DEFAULT_SETTINGS, normalizeSettings } from './settingsRepository';

function storeWith(initial) {
  let value = initial;
  return {
    get: vi.fn((_key, fallback) => value ?? fallback),
    set: vi.fn((_key, next) => { value = next; return true; }),
    remove: vi.fn(() => { value = null; return true; }),
  };
}

describe('settings repository', () => {
  test('normalizes unsupported saved values', () => {
    expect(normalizeSettings({ unitSystem: 'kelvin', theme: 'neon', refreshMinutes: 1 }))
      .toEqual(DEFAULT_SETTINGS);
  });

  test('reads and updates supported settings', () => {
    const repository = createSettingsRepository(storeWith());
    expect(repository.read()).toEqual(DEFAULT_SETTINGS);
    expect(repository.update({ unitSystem: 'imperial', theme: 'dark', refreshMinutes: 30 }))
      .toEqual({ unitSystem: 'imperial', theme: 'dark', refreshMinutes: 30 });
    expect(repository.update({ refreshMinutes: 90 }).refreshMinutes).toBe(10);
  });

  test('resets settings to independent defaults', () => {
    const store = storeWith({ unitSystem: 'imperial' });
    const repository = createSettingsRepository(store);
    expect(repository.reset()).toEqual(DEFAULT_SETTINGS);
    expect(store.remove).toHaveBeenCalled();
  });
});

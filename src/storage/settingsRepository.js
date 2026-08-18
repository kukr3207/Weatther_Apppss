import { normalizeUnitSystem } from '../domain/units';

const SETTINGS_KEY = 'settings.v1';
const THEMES = new Set(['system', 'light', 'dark']);

export const DEFAULT_SETTINGS = Object.freeze({
  unitSystem: 'metric',
  theme: 'system',
  refreshMinutes: 10,
});

function normalizeRefreshMinutes(value) {
  return Number.isInteger(value) && value >= 5 && value <= 60 ? value : DEFAULT_SETTINGS.refreshMinutes;
}

export function normalizeSettings(value) {
  const candidate = value && typeof value === 'object' ? value : {};
  return {
    unitSystem: normalizeUnitSystem(candidate.unitSystem),
    theme: THEMES.has(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme,
    refreshMinutes: normalizeRefreshMinutes(candidate.refreshMinutes),
  };
}

export function createSettingsRepository(store) {
  return {
    read() {
      return normalizeSettings(store.get(SETTINGS_KEY, DEFAULT_SETTINGS));
    },

    update(changes) {
      const next = normalizeSettings({ ...this.read(), ...changes });
      store.set(SETTINGS_KEY, next);
      return next;
    },

    reset() {
      store.remove(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS };
    },
  };
}

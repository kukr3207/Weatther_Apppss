import { ALERT_SEVERITIES } from '../domain/weatherAlerts';

const ALERT_PREFERENCES_KEY = 'alert-preferences.v1';
const ALLOWED_TYPES = new Set([
  'extreme-heat',
  'hard-freeze',
  'strong-wind',
  'wind-gusts',
  'heavy-rain',
  'thunderstorm',
  'snow',
  'low-visibility',
  'provider-alert',
]);

export const DEFAULT_ALERT_PREFERENCES = Object.freeze({
  minimumSeverity: 'info',
  disabledTypes: Object.freeze([]),
  browserNotifications: false,
});

export function normalizeAlertPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    minimumSeverity: ALERT_SEVERITIES[source.minimumSeverity] ? source.minimumSeverity : 'info',
    disabledTypes: [...new Set(Array.isArray(source.disabledTypes) ? source.disabledTypes : [])]
      .filter((type) => ALLOWED_TYPES.has(type))
      .sort(),
    browserNotifications: source.browserNotifications === true,
  };
}

export function createAlertPreferencesRepository(store) {
  return {
    read() {
      return normalizeAlertPreferences(store.get(ALERT_PREFERENCES_KEY, DEFAULT_ALERT_PREFERENCES));
    },
    update(changes) {
      const next = normalizeAlertPreferences({ ...this.read(), ...changes });
      store.set(ALERT_PREFERENCES_KEY, next);
      return next;
    },
    toggleType(type) {
      if (!ALLOWED_TYPES.has(type)) return this.read();
      const current = this.read();
      const disabled = new Set(current.disabledTypes);
      if (disabled.has(type)) disabled.delete(type);
      else disabled.add(type);
      return this.update({ disabledTypes: [...disabled] });
    },
    reset() {
      store.remove(ALERT_PREFERENCES_KEY);
      return { ...DEFAULT_ALERT_PREFERENCES, disabledTypes: [] };
    },
  };
}

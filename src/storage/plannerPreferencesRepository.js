import { ACTIVITIES } from '../domain/activityPlanner';

const PLANNER_KEY = 'planner-preferences.v1';
const ACTIVITY_IDS = new Set(ACTIVITIES.map((activity) => activity.id));

export const DEFAULT_PLANNER_PREFERENCES = Object.freeze({
  selectedActivity: 'walk',
  temperatureRangeC: Object.freeze([8, 28]),
  maximumWindMps: 12,
  maximumRainProbability: 0.3,
});

function normalizeRange(value) {
  if (!Array.isArray(value) || value.length !== 2) return [...DEFAULT_PLANNER_PREFERENCES.temperatureRangeC];
  const [minimum, maximum] = value;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < -50 || maximum > 60 || minimum >= maximum) {
    return [...DEFAULT_PLANNER_PREFERENCES.temperatureRangeC];
  }
  return [Math.round(minimum), Math.round(maximum)];
}

export function normalizePlannerPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    selectedActivity: ACTIVITY_IDS.has(source.selectedActivity)
      ? source.selectedActivity
      : DEFAULT_PLANNER_PREFERENCES.selectedActivity,
    temperatureRangeC: normalizeRange(source.temperatureRangeC),
    maximumWindMps: Number.isFinite(source.maximumWindMps)
      ? Math.max(1, Math.min(40, source.maximumWindMps))
      : DEFAULT_PLANNER_PREFERENCES.maximumWindMps,
    maximumRainProbability: Number.isFinite(source.maximumRainProbability)
      ? Math.max(0, Math.min(1, source.maximumRainProbability))
      : DEFAULT_PLANNER_PREFERENCES.maximumRainProbability,
  };
}

export function createPlannerPreferencesRepository(store) {
  return {
    read() {
      return normalizePlannerPreferences(store.get(PLANNER_KEY, DEFAULT_PLANNER_PREFERENCES));
    },
    update(changes) {
      const next = normalizePlannerPreferences({ ...this.read(), ...changes });
      store.set(PLANNER_KEY, next);
      return next;
    },
    reset() {
      store.remove(PLANNER_KEY);
      return { ...DEFAULT_PLANNER_PREFERENCES, temperatureRangeC: [...DEFAULT_PLANNER_PREFERENCES.temperatureRangeC] };
    },
  };
}

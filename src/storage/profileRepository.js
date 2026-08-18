const PROFILE_KEY = 'health-profile.v1';

export const DEFAULT_HEALTH_PROFILE = Object.freeze({
  asthma: false,
  heartCondition: false,
  child: false,
  olderAdult: false,
  pollenSensitive: false,
});

export function normalizeHealthProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.keys(DEFAULT_HEALTH_PROFILE).reduce((profile, key) => {
    profile[key] = source[key] === true;
    return profile;
  }, {});
}

export function createProfileRepository(store) {
  return {
    read() {
      return normalizeHealthProfile(store.get(PROFILE_KEY, DEFAULT_HEALTH_PROFILE));
    },
    update(changes) {
      const next = normalizeHealthProfile({ ...this.read(), ...changes });
      store.set(PROFILE_KEY, next);
      return next;
    },
    reset() {
      store.remove(PROFILE_KEY);
      return { ...DEFAULT_HEALTH_PROFILE };
    },
  };
}

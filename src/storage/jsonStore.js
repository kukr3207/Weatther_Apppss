export function createJsonStore(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const namespace = options.namespace ?? 'weather-app';

  function storageKey(key) {
    return `${namespace}:${key}`;
  }

  return {
    get(key, fallback) {
      try {
        const value = storage.getItem(storageKey(key));
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        storage.setItem(storageKey(key), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },

    remove(key) {
      try {
        storage.removeItem(storageKey(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

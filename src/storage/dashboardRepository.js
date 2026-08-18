const DASHBOARDS_KEY = 'dashboards.v1';
const MAX_DASHBOARDS = 6;
const MAX_LOCATIONS = 6;

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') return null;
  const name = normalizeName(location.name);
  if (!name || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  return {
    id: typeof location.id === 'string' && location.id.trim()
      ? location.id.trim()
      : `${location.latitude},${location.longitude}`,
    name,
    country: typeof location.country === 'string' ? location.country.trim().slice(0, 3) : '',
    state: typeof location.state === 'string' ? location.state.trim().slice(0, 80) : '',
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function normalizeDashboard(dashboard) {
  if (!dashboard || typeof dashboard !== 'object') return null;
  const id = typeof dashboard.id === 'string' ? dashboard.id.trim() : '';
  const name = normalizeName(dashboard.name);
  if (!id || !name) return null;
  const seen = new Set();
  const locations = (Array.isArray(dashboard.locations) ? dashboard.locations : [])
    .map(normalizeLocation)
    .filter((location) => {
      if (!location || seen.has(location.id)) return false;
      seen.add(location.id);
      return true;
    })
    .slice(0, MAX_LOCATIONS);
  const createdAt = Number.isNaN(Date.parse(dashboard.createdAt)) ? new Date(0).toISOString() : dashboard.createdAt;
  const updatedAt = Number.isNaN(Date.parse(dashboard.updatedAt)) ? createdAt : dashboard.updatedAt;
  return { id, name, locations, createdAt, updatedAt };
}

function createId(now) {
  return `dashboard-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDashboardRepository(store, options = {}) {
  const now = options.now ?? (() => new Date());

  function list() {
    const source = store.get(DASHBOARDS_KEY, []);
    if (!Array.isArray(source)) return [];
    return source
      .map(normalizeDashboard)
      .filter(Boolean)
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, MAX_DASHBOARDS);
  }

  function write(dashboards) {
    const normalized = dashboards.map(normalizeDashboard).filter(Boolean).slice(0, MAX_DASHBOARDS);
    store.set(DASHBOARDS_KEY, normalized);
    return list();
  }

  return {
    list,
    create(name, locations = []) {
      const normalizedName = normalizeName(name);
      if (!normalizedName) throw new TypeError('Dashboard name is required.');
      const dashboards = list();
      if (dashboards.length >= MAX_DASHBOARDS) throw new RangeError('Dashboard limit reached.');
      if (dashboards.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())) {
        throw new Error('A dashboard with this name already exists.');
      }
      const date = now().toISOString();
      const dashboard = normalizeDashboard({
        id: createId(now()),
        name: normalizedName,
        locations,
        createdAt: date,
        updatedAt: date,
      });
      write([dashboard, ...dashboards]);
      return dashboard;
    },
    rename(id, name) {
      const normalizedName = normalizeName(name);
      if (!normalizedName) throw new TypeError('Dashboard name is required.');
      const dashboards = list();
      if (dashboards.some((item) => item.id !== id && item.name.toLowerCase() === normalizedName.toLowerCase())) {
        throw new Error('A dashboard with this name already exists.');
      }
      let updated = null;
      write(dashboards.map((dashboard) => {
        if (dashboard.id !== id) return dashboard;
        updated = { ...dashboard, name: normalizedName, updatedAt: now().toISOString() };
        return updated;
      }));
      return updated;
    },
    addLocation(id, location) {
      const normalized = normalizeLocation(location);
      if (!normalized) throw new TypeError('A valid location is required.');
      let updated = null;
      write(list().map((dashboard) => {
        if (dashboard.id !== id) return dashboard;
        if (dashboard.locations.some((item) => item.id === normalized.id)) return dashboard;
        if (dashboard.locations.length >= MAX_LOCATIONS) throw new RangeError('Location limit reached.');
        updated = { ...dashboard, locations: [...dashboard.locations, normalized], updatedAt: now().toISOString() };
        return updated;
      }));
      return updated;
    },
    removeLocation(id, locationId) {
      let updated = null;
      write(list().map((dashboard) => {
        if (dashboard.id !== id) return dashboard;
        updated = {
          ...dashboard,
          locations: dashboard.locations.filter((location) => location.id !== locationId),
          updatedAt: now().toISOString(),
        };
        return updated;
      }));
      return updated;
    },
    remove(id) {
      return write(list().filter((dashboard) => dashboard.id !== id));
    },
    clear() {
      store.remove(DASHBOARDS_KEY);
      return [];
    },
    replace(items) {
      return write(Array.isArray(items) ? items : []);
    },
  };
}

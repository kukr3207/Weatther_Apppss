import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_AIR_QUALITY, DEFAULT_CURRENT_WEATHER, DEFAULT_FORECAST } from '../data/defaultWeather';
import { WEATHER_ERROR_CODES, WeatherServiceError } from '../services/errors';
import { createOpenWeatherClient } from '../services/openWeatherClient';
import { locateDevice } from '../services/geolocation';
import { createFavoritesRepository } from '../storage/favoritesRepository';
import { createJsonStore } from '../storage/jsonStore';
import { createRecentSearchesRepository } from '../storage/recentSearchesRepository';
import { createSettingsRepository } from '../storage/settingsRepository';
import { createAlertPreferencesRepository } from '../storage/alertPreferencesRepository';
import { createDashboardRepository } from '../storage/dashboardRepository';
import { createLocationNotesRepository } from '../storage/locationNotesRepository';
import { createPlannerPreferencesRepository } from '../storage/plannerPreferencesRepository';
import { createProfileRepository } from '../storage/profileRepository';
import { createSnapshotRepository } from '../storage/snapshotRepository';
import { migrateStoredData } from '../storage/schemaMigrations';

function locationFromWeather(weather) {
  const location = weather.location;
  return { ...location, id: `${location.latitude},${location.longitude}` };
}

function errorMessage(error) {
  if (error instanceof WeatherServiceError) return error.message;
  return 'Unable to update the weather right now.';
}

export function useWeatherDashboard(options = {}) {
  const services = useMemo(() => {
    const store = options.store ?? createJsonStore();
    migrateStoredData(store);
    return {
      client: options.client ?? createOpenWeatherClient(),
      favorites: options.favorites ?? createFavoritesRepository(store),
      recent: options.recent ?? createRecentSearchesRepository(store),
      settings: options.settings ?? createSettingsRepository(store),
      locate: options.locate ?? locateDevice,
      alerts: options.alerts ?? createAlertPreferencesRepository(store),
      dashboards: options.dashboards ?? createDashboardRepository(store),
      notes: options.notes ?? createLocationNotesRepository(store),
      planner: options.planner ?? createPlannerPreferencesRepository(store),
      profile: options.profile ?? createProfileRepository(store),
      snapshots: options.snapshots ?? createSnapshotRepository(store),
    };
  }, [
    options.alerts,
    options.client,
    options.dashboards,
    options.favorites,
    options.locate,
    options.notes,
    options.planner,
    options.profile,
    options.recent,
    options.settings,
    options.snapshots,
    options.store,
  ]);

  const [current, setCurrent] = useState(options.initialCurrent ?? DEFAULT_CURRENT_WEATHER);
  const [forecast, setForecast] = useState(options.initialForecast ?? DEFAULT_FORECAST);
  const [airQuality, setAirQuality] = useState(options.initialAirQuality ?? DEFAULT_AIR_QUALITY);
  const [airQualityForecast, setAirQualityForecast] = useState([]);
  const [providerAlerts] = useState(options.initialProviderAlerts ?? []);
  const [favorites, setFavorites] = useState(() => services.favorites.list());
  const [recentSearches, setRecentSearches] = useState(() => services.recent.list());
  const [settings, setSettings] = useState(() => services.settings.read());
  const [alertPreferences, setAlertPreferences] = useState(() => services.alerts.read());
  const [dashboards, setDashboards] = useState(() => services.dashboards.list());
  const [notes, setNotes] = useState(() => services.notes.list());
  const [plannerPreferences, setPlannerPreferences] = useState(() => services.planner.read());
  const [healthProfile, setHealthProfile] = useState(() => services.profile.read());
  const [snapshots, setSnapshots] = useState(() => services.snapshots.list());
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const loadLocation = useCallback(async (location, options = {}) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus({ type: 'loading', message: `Loading weather for ${location.name}…` });

    try {
      const [nextCurrent, nextForecast] = await Promise.all([
        services.client.getCurrent(location, { signal: controller.signal }),
        services.client.getForecast(location, { signal: controller.signal }),
      ]);
      let nextAirQuality = null;
      if (typeof services.client.getAirQuality === 'function') {
        try {
          const airPayload = await services.client.getAirQuality(location, { signal: controller.signal });
          nextAirQuality = airPayload?.current ?? null;
          setAirQualityForecast(Array.isArray(airPayload?.readings) ? airPayload.readings : []);
          if (nextAirQuality) setAirQuality(nextAirQuality);
        } catch (airError) {
          if (airError?.code === WEATHER_ERROR_CODES.aborted) throw airError;
        }
      }
      setCurrent(nextCurrent);
      setForecast(nextForecast);
      if (options.record !== false) setRecentSearches(services.recent.record(locationFromWeather(nextCurrent)));
      if (options.record !== false) {
        services.snapshots.record(nextCurrent, nextAirQuality);
        setSnapshots(services.snapshots.list());
      }
      setStatus({ type: 'success', message: `Weather updated for ${nextCurrent.location.name}.` });
      return nextCurrent;
    } catch (error) {
      if (error?.code !== WEATHER_ERROR_CODES.aborted) {
        setStatus({ type: 'error', message: errorMessage(error) });
      }
      return null;
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [services]);

  const search = useCallback(async (query) => {
    setStatus({ type: 'loading', message: `Finding ${query}…` });
    try {
      const locations = await services.client.searchLocations(query);
      if (locations.length === 0) {
        throw new WeatherServiceError(WEATHER_ERROR_CODES.notFound, 'Location not found.');
      }
      return loadLocation(locations[0]);
    } catch (error) {
      setStatus({ type: 'error', message: errorMessage(error) });
      return null;
    }
  }, [loadLocation, services]);

  const activeLocation = current ? locationFromWeather(current) : null;
  const isFavorite = activeLocation ? services.favorites.has(activeLocation) : false;

  return {
    current,
    forecast,
    airQuality,
    airQualityForecast,
    providerAlerts,
    favorites,
    recentSearches,
    settings,
    alertPreferences,
    dashboards,
    notes,
    plannerPreferences,
    healthProfile,
    snapshots,
    status,
    activeLocation,
    isFavorite,
    isLoading: status.type === 'loading',
    search,
    async locate() {
      setStatus({ type: 'loading', message: 'Finding your location…' });
      try {
        const location = await services.locate();
        return loadLocation(location);
      } catch (error) {
        setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to find your location.' });
        return null;
      }
    },
    selectLocation: loadLocation,
    refresh: () => activeLocation && loadLocation(activeLocation, { record: false }),
    toggleFavorite() {
      if (!activeLocation) return;
      setFavorites(isFavorite
        ? services.favorites.remove(activeLocation.id)
        : services.favorites.add(activeLocation));
    },
    removeFavorite(id) {
      setFavorites(services.favorites.remove(id));
    },
    clearRecentSearches() {
      setRecentSearches(services.recent.clear());
    },
    setUnitSystem(unitSystem) {
      setSettings(services.settings.update({ unitSystem }));
    },
    updateSettings(changes) {
      setSettings(services.settings.update(changes));
    },
    updateAlertPreferences(changes) {
      setAlertPreferences(services.alerts.update(changes));
    },
    updatePlannerPreferences(changes) {
      setPlannerPreferences(services.planner.update(changes));
    },
    updateHealthProfile(changes) {
      setHealthProfile(services.profile.update(changes));
    },
    saveNote(text) {
      if (!activeLocation) return null;
      const note = services.notes.save(activeLocation.id, text);
      setNotes(services.notes.list());
      return note;
    },
    removeNote() {
      if (!activeLocation) return;
      setNotes(services.notes.remove(activeLocation.id));
    },
    createDashboard(name) {
      const dashboard = services.dashboards.create(name, activeLocation ? [activeLocation] : []);
      setDashboards(services.dashboards.list());
      return dashboard;
    },
    removeDashboard(id) {
      setDashboards(services.dashboards.remove(id));
    },
    addLocationToDashboard(id) {
      if (!activeLocation) return null;
      const dashboard = services.dashboards.addLocation(id, activeLocation);
      setDashboards(services.dashboards.list());
      return dashboard;
    },
    clearSnapshots() {
      setSnapshots(services.snapshots.clear());
    },
    importWorkspace(sections) {
      if (!sections || typeof sections !== 'object') throw new TypeError('Workspace sections are required.');
      if (sections.settings) setSettings(services.settings.update(sections.settings));
      if (sections.alertPreferences) setAlertPreferences(services.alerts.update(sections.alertPreferences));
      if (sections.healthProfile) setHealthProfile(services.profile.update(sections.healthProfile));
      if (sections.plannerPreferences) setPlannerPreferences(services.planner.update(sections.plannerPreferences));
      if (sections.favorites && typeof services.favorites.replace === 'function') {
        setFavorites(services.favorites.replace(sections.favorites));
      }
      if (sections.recentSearches && typeof services.recent.replace === 'function') {
        setRecentSearches(services.recent.replace(sections.recentSearches));
      }
      if (sections.dashboards && typeof services.dashboards.replace === 'function') {
        setDashboards(services.dashboards.replace(sections.dashboards));
      }
      if (sections.notes && typeof services.notes.replace === 'function') {
        setNotes(services.notes.replace(sections.notes));
      }
      return true;
    },
    activeNote: activeLocation ? notes.find((note) => note.locationId === activeLocation.id) ?? null : null,
  };
}

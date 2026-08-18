import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CURRENT_WEATHER, DEFAULT_FORECAST } from '../data/defaultWeather';
import { WEATHER_ERROR_CODES, WeatherServiceError } from '../services/errors';
import { createOpenWeatherClient } from '../services/openWeatherClient';
import { createFavoritesRepository } from '../storage/favoritesRepository';
import { createJsonStore } from '../storage/jsonStore';
import { createRecentSearchesRepository } from '../storage/recentSearchesRepository';
import { createSettingsRepository } from '../storage/settingsRepository';

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
    return {
      client: options.client ?? createOpenWeatherClient(),
      favorites: options.favorites ?? createFavoritesRepository(store),
      recent: options.recent ?? createRecentSearchesRepository(store),
      settings: options.settings ?? createSettingsRepository(store),
    };
  }, [options.client, options.favorites, options.recent, options.settings, options.store]);

  const [current, setCurrent] = useState(options.initialCurrent ?? DEFAULT_CURRENT_WEATHER);
  const [forecast, setForecast] = useState(options.initialForecast ?? DEFAULT_FORECAST);
  const [favorites, setFavorites] = useState(() => services.favorites.list());
  const [recentSearches, setRecentSearches] = useState(() => services.recent.list());
  const [settings, setSettings] = useState(() => services.settings.read());
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
      setCurrent(nextCurrent);
      setForecast(nextForecast);
      if (options.record !== false) setRecentSearches(services.recent.record(locationFromWeather(nextCurrent)));
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
    favorites,
    recentSearches,
    settings,
    status,
    activeLocation,
    isFavorite,
    isLoading: status.type === 'loading',
    search,
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
  };
}

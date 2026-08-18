const DEFAULT_BASE_URL = 'https://api.openweathermap.org';

export class WeatherConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WeatherConfigurationError';
  }
}

function normalizeBaseUrl(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return (candidate || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function readWeatherConfig(environment = import.meta.env) {
  const apiKey = typeof environment.VITE_OPENWEATHER_API_KEY === 'string'
    ? environment.VITE_OPENWEATHER_API_KEY.trim()
    : '';

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(environment.VITE_OPENWEATHER_BASE_URL),
    isConfigured: apiKey.length > 0,
  };
}

export function requireWeatherConfig(environment = import.meta.env) {
  const config = readWeatherConfig(environment);
  if (!config.isConfigured) {
    throw new WeatherConfigurationError('Weather service is not configured.');
  }
  return config;
}

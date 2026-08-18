import { WeatherServiceError, WEATHER_ERROR_CODES } from '../errors';

function invalidResponse(message) {
  throw new WeatherServiceError(WEATHER_ERROR_CODES.invalidResponse, message);
}

function finite(value, field) {
  return Number.isFinite(value) ? value : invalidResponse(`Missing numeric field: ${field}.`);
}

function text(value, field) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : invalidResponse(`Missing text field: ${field}.`);
}

function isoFromUnixSeconds(value, field) {
  const seconds = finite(value, field);
  return new Date(seconds * 1000).toISOString();
}

export function mapCurrentWeather(payload) {
  if (!payload || typeof payload !== 'object') invalidResponse('Weather response must be an object.');

  const condition = Array.isArray(payload.weather) ? payload.weather[0] : null;
  if (!condition || typeof condition !== 'object') invalidResponse('Weather condition is missing.');

  return {
    location: {
      name: text(payload.name, 'name'),
      country: text(payload.sys?.country, 'sys.country'),
      latitude: finite(payload.coord?.lat, 'coord.lat'),
      longitude: finite(payload.coord?.lon, 'coord.lon'),
    },
    observedAt: isoFromUnixSeconds(payload.dt, 'dt'),
    timezoneOffsetSeconds: finite(payload.timezone, 'timezone'),
    temperatureC: finite(payload.main?.temp, 'main.temp'),
    feelsLikeC: finite(payload.main?.feels_like, 'main.feels_like'),
    humidityPercent: finite(payload.main?.humidity, 'main.humidity'),
    pressureHpa: finite(payload.main?.pressure, 'main.pressure'),
    visibilityMeters: Number.isFinite(payload.visibility) ? payload.visibility : null,
    wind: {
      speedMps: finite(payload.wind?.speed, 'wind.speed'),
      directionDegrees: Number.isFinite(payload.wind?.deg) ? payload.wind.deg : null,
      gustMps: Number.isFinite(payload.wind?.gust) ? payload.wind.gust : null,
    },
    condition: {
      id: finite(condition.id, 'weather[0].id'),
      description: text(condition.description, 'weather[0].description'),
      iconCode: text(condition.icon, 'weather[0].icon'),
    },
    sunriseAt: isoFromUnixSeconds(payload.sys?.sunrise, 'sys.sunrise'),
    sunsetAt: isoFromUnixSeconds(payload.sys?.sunset, 'sys.sunset'),
  };
}

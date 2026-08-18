import { normalizePollutants } from '../../domain/airQuality';
import { WeatherServiceError, WEATHER_ERROR_CODES } from '../errors';

function invalid(message) {
  throw new WeatherServiceError(WEATHER_ERROR_CODES.invalidResponse, message);
}

function mapReading(item, index) {
  if (!item || typeof item !== 'object') invalid(`Air-quality reading ${index} is invalid.`);
  const timestamp = Number.isFinite(item.dt) ? new Date(item.dt * 1000) : null;
  if (!timestamp || Number.isNaN(timestamp.getTime())) invalid(`Air-quality reading ${index} has no valid date.`);
  const aqi = item.main?.aqi;
  if (!Number.isInteger(aqi) || aqi < 1 || aqi > 5) invalid(`Air-quality reading ${index} has an invalid index.`);
  return {
    index: aqi,
    observedAt: timestamp.toISOString(),
    components: normalizePollutants(item.components),
  };
}

export function mapAirQuality(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.list) || !payload.list.length) {
    invalid('Air-quality response must include at least one reading.');
  }
  const readings = payload.list.map(mapReading);
  return { current: readings[0], readings };
}

export function mapAirQualityForecast(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.list)) {
    invalid('Air-quality forecast must include a list.');
  }
  return payload.list.map(mapReading);
}

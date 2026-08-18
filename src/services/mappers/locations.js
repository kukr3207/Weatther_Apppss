import { WeatherServiceError, WEATHER_ERROR_CODES } from '../errors';

function invalidLocation(index) {
  throw new WeatherServiceError(
    WEATHER_ERROR_CODES.invalidResponse,
    `Invalid location result at index ${index}.`,
  );
}

export function mapLocations(payload) {
  if (!Array.isArray(payload)) {
    throw new WeatherServiceError(
      WEATHER_ERROR_CODES.invalidResponse,
      'Location response must be an array.',
    );
  }

  return payload.map((item, index) => {
    if (!item || typeof item !== 'object') return invalidLocation(index);
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const country = typeof item.country === 'string' ? item.country.trim() : '';
    if (!name || !country || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) {
      return invalidLocation(index);
    }
    const state = typeof item.state === 'string' && item.state.trim() ? item.state.trim() : null;
    return {
      id: `${item.lat},${item.lon}`,
      name,
      state,
      country,
      latitude: item.lat,
      longitude: item.lon,
      label: [name, state, country].filter(Boolean).join(', '),
    };
  });
}

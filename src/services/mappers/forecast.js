import { WeatherServiceError, WEATHER_ERROR_CODES } from '../errors';

function invalidResponse(message) {
  throw new WeatherServiceError(WEATHER_ERROR_CODES.invalidResponse, message);
}

function finite(value, field) {
  return Number.isFinite(value) ? value : invalidResponse(`Missing numeric field: ${field}.`);
}

function mapForecastItem(item, index) {
  const condition = Array.isArray(item?.weather) ? item.weather[0] : null;
  if (!condition || typeof condition !== 'object') {
    invalidResponse(`Missing forecast condition at index ${index}.`);
  }

  const iconCode = typeof condition.icon === 'string' ? condition.icon.trim() : '';
  const description = typeof condition.description === 'string' ? condition.description.trim() : '';
  if (!iconCode || !description) invalidResponse(`Invalid forecast condition at index ${index}.`);

  return {
    forecastAt: new Date(finite(item.dt, `list[${index}].dt`) * 1000).toISOString(),
    temperatureC: finite(item.main?.temp, `list[${index}].main.temp`),
    feelsLikeC: finite(item.main?.feels_like, `list[${index}].main.feels_like`),
    minimumC: finite(item.main?.temp_min, `list[${index}].main.temp_min`),
    maximumC: finite(item.main?.temp_max, `list[${index}].main.temp_max`),
    humidityPercent: finite(item.main?.humidity, `list[${index}].main.humidity`),
    precipitationProbability: Math.min(1, Math.max(0, Number.isFinite(item.pop) ? item.pop : 0)),
    rainMm: Number.isFinite(item.rain?.['3h']) ? item.rain['3h'] : 0,
    windSpeedMps: finite(item.wind?.speed, `list[${index}].wind.speed`),
    condition: { iconCode, description },
  };
}

export function mapForecast(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.list)) {
    invalidResponse('Forecast response must include a list.');
  }

  return {
    location: {
      name: typeof payload.city?.name === 'string' ? payload.city.name.trim() : '',
      country: typeof payload.city?.country === 'string' ? payload.city.country.trim() : '',
      latitude: finite(payload.city?.coord?.lat, 'city.coord.lat'),
      longitude: finite(payload.city?.coord?.lon, 'city.coord.lon'),
      timezoneOffsetSeconds: finite(payload.city?.timezone, 'city.timezone'),
    },
    items: payload.list.map(mapForecastItem),
  };
}

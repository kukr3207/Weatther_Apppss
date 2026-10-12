import { assertArray, assertObject, assertString, deepFreeze, normalizeLocation, parseTimestamp } from '../core/validation';

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function probability(value) {
  const number = finite(value);
  if (number === null) return null;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function normalizeCondition(value = {}) {
  if (typeof value === 'string') return Object.freeze({ id: null, code: null, description: value, iconCode: null });
  return Object.freeze({
    id: finite(value.id),
    code: value.code ?? null,
    description: String(value.description ?? value.text ?? value.main ?? 'Unknown conditions'),
    iconCode: value.iconCode ?? value.icon ?? null,
  });
}

export function normalizeProviderLocation(input, providerId = 'provider') {
  assertObject(input, 'Provider location');
  const coordinates = input.coord ?? input.coordinates ?? input;
  const normalized = normalizeLocation({
    id: input.id === null || input.id === undefined
      ? input.placeId ?? input.geonameId ?? null
      : String(input.id),
    name: input.name ?? input.city ?? input.locality,
    state: input.state ?? input.region ?? input.administrativeArea,
    country: input.country ?? input.countryCode,
    latitude: finite(coordinates.latitude ?? coordinates.lat),
    longitude: finite(coordinates.longitude ?? coordinates.lon ?? coordinates.lng),
    timezone: input.timezone ?? input.timeZone,
  });
  return deepFreeze({ ...normalized, providerId });
}

function hasLocation(input) {
  const value = input?.coord ?? input?.coordinates ?? input;
  return finite(value?.latitude ?? value?.lat) !== null
    && finite(value?.longitude ?? value?.lon ?? value?.lng) !== null
    && Boolean(input?.name ?? input?.city ?? input?.locality);
}

function observationTimestamp(input, options) {
  if (input.observedAt !== null && input.observedAt !== undefined) return input.observedAt;
  if (input.timestamp !== null && input.timestamp !== undefined) return input.timestamp;
  if (Number.isFinite(input.dt)) return input.dt * 1000;
  return options.receivedAt ?? new Date().toISOString();
}

export function normalizeCurrentObservation(input, options = {}) {
  assertObject(input, 'Provider observation');
  const locationInput = options.location ?? input.location ?? (hasLocation(input) ? input : null);
  const location = locationInput ? normalizeProviderLocation(locationInput, options.providerId) : null;
  const observedAt = new Date(parseTimestamp(observationTimestamp(input, options))).toISOString();
  return deepFreeze({
    providerId: assertString(options.providerId ?? input.providerId ?? 'provider', 'Provider id'),
    location,
    observedAt,
    timezoneOffsetSeconds: finite(input.timezoneOffsetSeconds ?? input.timezoneOffset ?? input.timezone, 0),
    temperatureC: finite(input.temperatureC ?? input.tempC ?? input.temp ?? input.main?.temp),
    feelsLikeC: finite(input.feelsLikeC ?? input.apparentTemperatureC ?? input.main?.feels_like),
    minimumC: finite(input.minimumC ?? input.main?.temp_min),
    maximumC: finite(input.maximumC ?? input.main?.temp_max),
    humidityPercent: finite(input.humidityPercent ?? input.relativeHumidity ?? input.main?.humidity),
    pressureHpa: finite(input.pressureHpa ?? input.pressure ?? input.main?.pressure),
    visibilityMeters: finite(input.visibilityMeters ?? input.visibility),
    wind: {
      speedMps: finite(input.windSpeedMps ?? input.wind?.speed),
      directionDegrees: finite(input.windDirectionDegrees ?? input.wind?.deg),
      gustMps: finite(input.windGustMps ?? input.wind?.gust),
    },
    cloudPercent: finite(input.cloudPercent ?? input.clouds?.all),
    precipitation: {
      rainMm: finite(input.rainMm ?? input.rain?.['1h'] ?? input.rain?.['3h'], 0),
      snowMm: finite(input.snowMm ?? input.snow?.['1h'] ?? input.snow?.['3h'], 0),
    },
    condition: normalizeCondition(input.condition ?? input.weather?.[0]),
    sunriseAt: input.sunriseAt ?? (input.sys?.sunrise ? new Date(input.sys.sunrise * 1000).toISOString() : null),
    sunsetAt: input.sunsetAt ?? (input.sys?.sunset ? new Date(input.sys.sunset * 1000).toISOString() : null),
    rawReference: options.rawReference ?? null,
  });
}

export function normalizeForecastItem(input, options = {}) {
  assertObject(input, 'Provider forecast item');
  const forecastValue = input.forecastAt ?? input.timestamp ?? input.dt_txt
    ?? (Number.isFinite(input.dt) ? input.dt * 1000 : undefined);
  const forecastAt = new Date(parseTimestamp(forecastValue)).toISOString();
  return deepFreeze({
    forecastAt,
    temperatureC: finite(input.temperatureC ?? input.tempC ?? input.temp ?? input.main?.temp),
    feelsLikeC: finite(input.feelsLikeC ?? input.main?.feels_like),
    minimumC: finite(input.minimumC ?? input.main?.temp_min ?? input.temperatureC),
    maximumC: finite(input.maximumC ?? input.main?.temp_max ?? input.temperatureC),
    humidityPercent: finite(input.humidityPercent ?? input.main?.humidity),
    pressureHpa: finite(input.pressureHpa ?? input.main?.pressure),
    precipitationProbability: probability(input.precipitationProbability ?? input.pop),
    rainMm: finite(input.rainMm ?? input.rain?.['1h'] ?? input.rain?.['3h'], 0),
    snowMm: finite(input.snowMm ?? input.snow?.['1h'] ?? input.snow?.['3h'], 0),
    windSpeedMps: finite(input.windSpeedMps ?? input.wind?.speed),
    windDirectionDegrees: finite(input.windDirectionDegrees ?? input.wind?.deg),
    windGustMps: finite(input.windGustMps ?? input.wind?.gust),
    visibilityMeters: finite(input.visibilityMeters ?? input.visibility),
    cloudPercent: finite(input.cloudPercent ?? input.clouds?.all),
    uvIndex: finite(input.uvIndex ?? input.uvi),
    condition: normalizeCondition(input.condition ?? input.weather?.[0]),
    providerMetadata: options.providerMetadata ?? null,
  });
}

export function normalizeForecastResponse(input, options = {}) {
  assertObject(input, 'Provider forecast');
  const providerId = assertString(options.providerId ?? input.providerId ?? 'provider', 'Provider id');
  const rawItems = input.items ?? input.list ?? input.forecast ?? input.hourly;
  const items = assertArray(rawItems, 'Provider forecast items', { nonEmpty: true })
    .map((item) => normalizeForecastItem(item, { providerMetadata: options.providerMetadata }))
    .sort((first, second) => parseTimestamp(first.forecastAt) - parseTimestamp(second.forecastAt));
  return deepFreeze({
    providerId,
    issuedAt: new Date(parseTimestamp(input.issuedAt ?? options.receivedAt ?? new Date().toISOString())).toISOString(),
    location: normalizeProviderLocation(options.location ?? input.location ?? input.city ?? input, providerId),
    items,
  });
}

export function createProviderAdapter(config) {
  assertObject(config, 'Provider adapter configuration');
  const id = assertString(config.id, 'Provider id', { maximum: 100 });
  const adapter = {
    id,
    name: config.name ?? id,
    capabilities: Object.freeze([...(config.capabilities ?? ['current', 'forecast'])]),
    normalizeLocation: (input) => normalizeProviderLocation(
      config.mapLocation ? config.mapLocation(input) : input,
      id,
    ),
    normalizeCurrent: (input, options = {}) => normalizeCurrentObservation(
      config.mapCurrent ? config.mapCurrent(input) : input,
      { ...options, providerId: id },
    ),
    normalizeForecast: (input, options = {}) => normalizeForecastResponse(
      config.mapForecast ? config.mapForecast(input) : input,
      { ...options, providerId: id },
    ),
  };
  const addOperation = (operation, defaultNormalizer) => {
    const endpoint = config[operation];
    if (!endpoint || typeof config.request !== 'function') return;
    adapter[operation] = async (parameters = {}, options = {}) => {
      const response = await config.request({
        providerId: id,
        operation,
        path: endpoint.path ?? null,
        parameters,
        signal: options.signal,
        headers: endpoint.headers ?? {},
      });
      const normalized = typeof endpoint.normalize === 'function'
        ? endpoint.normalize(response, { parameters, ...options })
        : defaultNormalizer(response, { ...options, location: options.location ?? parameters });
      return deepFreeze({ ...normalized, providerId: normalized.providerId ?? id });
    };
  };
  addOperation('current', adapter.normalizeCurrent);
  addOperation('forecast', adapter.normalizeForecast);
  return Object.freeze(adapter);
}

export function mergeProviderMetadata(normalized, metadata) {
  return deepFreeze({
    ...normalized,
    providerMetadata: {
      ...(normalized.providerMetadata ?? {}),
      ...metadata,
    },
  });
}

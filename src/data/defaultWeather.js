const START = Date.parse('2024-03-15T09:00:00.000Z');

export const DEFAULT_CURRENT_WEATHER = Object.freeze({
  location: Object.freeze({
    id: '51.5072,-0.1276',
    name: 'London',
    country: 'GB',
    state: 'England',
    latitude: 51.5072,
    longitude: -0.1276,
  }),
  observedAt: '2024-03-15T09:00:00.000Z',
  timezoneOffsetSeconds: 0,
  temperatureC: 24,
  feelsLikeC: 23,
  humidityPercent: 64,
  pressureHpa: 1016,
  visibilityMeters: 10_000,
  wind: Object.freeze({ speedMps: 5, directionDegrees: 230, gustMps: null }),
  condition: Object.freeze({ id: 801, description: 'few clouds', iconCode: '02d' }),
  sunriseAt: '2024-03-15T06:10:00.000Z',
  sunsetAt: '2024-03-15T18:05:00.000Z',
});

export const DEFAULT_FORECAST = Object.freeze({
  location: Object.freeze({
    name: 'London',
    country: 'GB',
    latitude: 51.5072,
    longitude: -0.1276,
    timezoneOffsetSeconds: 0,
  }),
  items: Object.freeze(Array.from({ length: 8 }, (_, index) => Object.freeze({
    forecastAt: new Date(START + index * 10_800_000).toISOString(),
    temperatureC: 24 - index * 0.8,
    feelsLikeC: 23 - index * 0.8,
    minimumC: 21 - index * 0.5,
    maximumC: 25 - index * 0.5,
    humidityPercent: 64 + index,
    precipitationProbability: index > 4 ? 0.35 : 0.08,
    rainMm: index > 4 ? 0.4 : 0,
    windSpeedMps: 5 + index * 0.2,
    condition: Object.freeze({
      iconCode: index > 4 ? '10n' : '02d',
      description: index > 4 ? 'light rain' : 'few clouds',
    }),
  }))),
});

export const DEFAULT_AIR_QUALITY = Object.freeze({
  index: 2,
  observedAt: '2024-03-15T09:00:00.000Z',
  components: Object.freeze({
    co: 216.96,
    no: 0.12,
    no2: 19.88,
    o3: 64.37,
    so2: 4.11,
    pm2_5: 8.42,
    pm10: 12.06,
    nh3: 1.22,
  }),
});

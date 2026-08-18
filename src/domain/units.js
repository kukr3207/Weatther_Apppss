export const UNIT_SYSTEMS = Object.freeze({
  metric: Object.freeze({ temperature: '°C', windSpeed: 'm/s' }),
  imperial: Object.freeze({ temperature: '°F', windSpeed: 'mph' }),
});

export function isUnitSystem(value) {
  return Object.hasOwn(UNIT_SYSTEMS, value);
}

export function normalizeUnitSystem(value, fallback = 'metric') {
  return isUnitSystem(value) ? value : fallback;
}

export function convertTemperature(celsius, unitSystem) {
  if (!Number.isFinite(celsius)) return null;
  return unitSystem === 'imperial' ? (celsius * 9) / 5 + 32 : celsius;
}

export function convertWindSpeed(metersPerSecond, unitSystem) {
  if (!Number.isFinite(metersPerSecond)) return null;
  return unitSystem === 'imperial' ? metersPerSecond * 2.236936 : metersPerSecond;
}

export function formatTemperature(celsius, unitSystem = 'metric') {
  const normalized = normalizeUnitSystem(unitSystem);
  const value = convertTemperature(celsius, normalized);
  return value === null ? '—' : `${Math.round(value)}${UNIT_SYSTEMS[normalized].temperature}`;
}

export function formatWindSpeed(metersPerSecond, unitSystem = 'metric') {
  const normalized = normalizeUnitSystem(unitSystem);
  const value = convertWindSpeed(metersPerSecond, normalized);
  return value === null ? '—' : `${value.toFixed(1)} ${UNIT_SYSTEMS[normalized].windSpeed}`;
}

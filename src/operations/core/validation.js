export class WeatherOperationsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WeatherOperationsError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const OPERATION_ERROR_CODES = Object.freeze({
  invalidArgument: 'invalid_argument',
  invalidObservation: 'invalid_observation',
  invalidLocation: 'invalid_location',
  invalidWindow: 'invalid_window',
  conflict: 'conflict',
  unavailable: 'unavailable',
  unsupported: 'unsupported',
});

function fail(code, message, details) {
  throw new WeatherOperationsError(code, message, details);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertObject(value, label = 'Value') {
  if (!isPlainObject(value)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be an object.`, { label });
  }
  return value;
}

export function assertArray(value, label = 'Value', options = {}) {
  if (!Array.isArray(value)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be an array.`, { label });
  }
  if (options.nonEmpty && value.length === 0) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must not be empty.`, { label });
  }
  if (Number.isInteger(options.maximum) && value.length > options.maximum) {
    fail(
      OPERATION_ERROR_CODES.invalidArgument,
      `${label} must contain at most ${options.maximum} items.`,
      { label, maximum: options.maximum, actual: value.length },
    );
  }
  return value;
}

export function assertString(value, label = 'Value', options = {}) {
  if (typeof value !== 'string') {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be text.`, { label });
  }
  const normalized = options.trim === false ? value : value.trim();
  if (options.nonEmpty !== false && !normalized) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must not be empty.`, { label });
  }
  if (Number.isInteger(options.maximum) && normalized.length > options.maximum) {
    fail(
      OPERATION_ERROR_CODES.invalidArgument,
      `${label} must be at most ${options.maximum} characters.`,
      { label, maximum: options.maximum, actual: normalized.length },
    );
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} has an invalid format.`, { label });
  }
  return normalized;
}

export function optionalString(value, label, options = {}) {
  if (value === null || value === undefined || value === '') return null;
  return assertString(value, label, options);
}

export function assertFiniteNumber(value, label = 'Value', options = {}) {
  const number = typeof value === 'string' && options.coerce ? Number(value) : value;
  if (!Number.isFinite(number)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be a finite number.`, { label });
  }
  if (Number.isFinite(options.minimum) && number < options.minimum) {
    fail(
      OPERATION_ERROR_CODES.invalidArgument,
      `${label} must be at least ${options.minimum}.`,
      { label, minimum: options.minimum, actual: number },
    );
  }
  if (Number.isFinite(options.maximum) && number > options.maximum) {
    fail(
      OPERATION_ERROR_CODES.invalidArgument,
      `${label} must be no more than ${options.maximum}.`,
      { label, maximum: options.maximum, actual: number },
    );
  }
  return number;
}

export function optionalFiniteNumber(value, label, options = {}) {
  if (value === null || value === undefined || value === '') return null;
  return assertFiniteNumber(value, label, options);
}

export function assertInteger(value, label = 'Value', options = {}) {
  const number = assertFiniteNumber(value, label, options);
  if (!Number.isInteger(number)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be an integer.`, { label });
  }
  return number;
}

export function assertBoolean(value, label = 'Value') {
  if (typeof value !== 'boolean') {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be true or false.`, { label });
  }
  return value;
}

export function assertEnum(value, allowed, label = 'Value') {
  assertArray(allowed, 'Allowed values', { nonEmpty: true });
  if (!allowed.includes(value)) {
    fail(
      OPERATION_ERROR_CODES.invalidArgument,
      `${label} must be one of: ${allowed.join(', ')}.`,
      { label, allowed, actual: value },
    );
  }
  return value;
}

export function parseTimestamp(value, label = 'Timestamp') {
  if (typeof value !== 'string' && !(value instanceof Date) && !Number.isFinite(value)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must identify a date and time.`, { label });
  }
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? value
      : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail(OPERATION_ERROR_CODES.invalidArgument, `${label} must be a valid date and time.`, { label });
  }
  return timestamp;
}

export function toIsoTimestamp(value, label = 'Timestamp') {
  return new Date(parseTimestamp(value, label)).toISOString();
}

export function assertChronologicalWindow(startsAt, endsAt, label = 'Window') {
  const start = parseTimestamp(startsAt, `${label} start`);
  const end = parseTimestamp(endsAt, `${label} end`);
  if (end <= start) {
    fail(
      OPERATION_ERROR_CODES.invalidWindow,
      `${label} must end after it starts.`,
      { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() },
    );
  }
  return Object.freeze({
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    durationMinutes: (end - start) / 60_000,
  });
}

export function normalizeCoordinates(location, label = 'Location') {
  assertObject(location, label);
  const latitude = assertFiniteNumber(location.latitude, `${label} latitude`, {
    minimum: -90,
    maximum: 90,
  });
  const longitude = assertFiniteNumber(location.longitude, `${label} longitude`, {
    minimum: -180,
    maximum: 180,
  });
  return Object.freeze({
    latitude,
    longitude,
  });
}

export function normalizeLocation(location, label = 'Location') {
  const coordinates = normalizeCoordinates(location, label);
  const name = assertString(location.name, `${label} name`, { maximum: 120 });
  const country = optionalString(location.country, `${label} country`, { maximum: 80 });
  const state = optionalString(location.state, `${label} state`, { maximum: 120 });
  const timezone = optionalString(location.timezone, `${label} timezone`, { maximum: 120 });
  const id = optionalString(location.id, `${label} id`, { maximum: 160 })
    ?? `${coordinates.latitude},${coordinates.longitude}`;
  return Object.freeze({
    id,
    name,
    country,
    state,
    timezone,
    ...coordinates,
  });
}

export function uniqueBy(items, selector, options = {}) {
  assertArray(items, options.label ?? 'Items');
  const selected = [];
  const keys = new Set();
  items.forEach((item, index) => {
    const key = selector(item, index);
    if (keys.has(key)) return;
    keys.add(key);
    selected.push(item);
  });
  return selected;
}

export function clamp(value, minimum, maximum) {
  const number = assertFiniteNumber(value, 'Value');
  const lower = assertFiniteNumber(minimum, 'Minimum');
  const upper = assertFiniteNumber(maximum, 'Maximum');
  if (upper < lower) {
    fail(OPERATION_ERROR_CODES.invalidArgument, 'Maximum must not be below minimum.');
  }
  return Math.min(upper, Math.max(lower, number));
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const places = assertInteger(digits, 'Decimal places', { minimum: 0, maximum: 10 });
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Reflect.ownKeys(value).forEach((key) => deepFreeze(value[key], seen));
  return Object.freeze(value);
}

export function createResult(value, metadata = {}) {
  return deepFreeze({
    value,
    metadata: {
      ...metadata,
      createdAt: metadata.createdAt ?? new Date().toISOString(),
    },
  });
}

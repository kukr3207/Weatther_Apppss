export const WEATHER_ERROR_CODES = Object.freeze({
  configuration: 'configuration',
  notFound: 'not_found',
  rateLimited: 'rate_limited',
  unavailable: 'unavailable',
  invalidResponse: 'invalid_response',
  network: 'network',
  aborted: 'aborted',
});

export class WeatherServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'WeatherServiceError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function weatherErrorFromStatus(status) {
  if (status === 401 || status === 403) {
    return new WeatherServiceError(
      WEATHER_ERROR_CODES.configuration,
      'Weather service credentials were rejected.',
      { status },
    );
  }
  if (status === 404) {
    return new WeatherServiceError(WEATHER_ERROR_CODES.notFound, 'Location not found.', { status });
  }
  if (status === 429) {
    return new WeatherServiceError(
      WEATHER_ERROR_CODES.rateLimited,
      'Weather service request limit reached.',
      { status, retryable: true },
    );
  }
  return new WeatherServiceError(
    WEATHER_ERROR_CODES.unavailable,
    'Weather service is unavailable.',
    { status, retryable: status >= 500 },
  );
}

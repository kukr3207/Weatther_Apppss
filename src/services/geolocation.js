export const GEOLOCATION_ERROR_CODES = Object.freeze({
  unsupported: 'unsupported',
  denied: 'denied',
  unavailable: 'unavailable',
  timeout: 'timeout',
});

export class GeolocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
  }
}

function mappedError(error) {
  if (error?.code === 1) return new GeolocationError(GEOLOCATION_ERROR_CODES.denied, 'Location permission was denied.');
  if (error?.code === 3) return new GeolocationError(GEOLOCATION_ERROR_CODES.timeout, 'Location request timed out.');
  return new GeolocationError(GEOLOCATION_ERROR_CODES.unavailable, 'Current location is unavailable.');
}

export function locateDevice(options = {}) {
  const geolocation = options.geolocation ?? globalThis.navigator?.geolocation;
  if (!geolocation) {
    return Promise.reject(
      new GeolocationError(GEOLOCATION_ERROR_CODES.unsupported, 'This browser does not support location access.'),
    );
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve({
        name: 'Current location',
        country: '',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      }),
      (error) => reject(mappedError(error)),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        timeout: options.timeout ?? 10_000,
        maximumAge: options.maximumAge ?? 300_000,
      },
    );
  });
}

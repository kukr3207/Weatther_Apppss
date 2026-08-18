import { describe, expect, test, vi } from 'vitest';
import { GeolocationError, GEOLOCATION_ERROR_CODES, locateDevice } from './geolocation';

describe('device geolocation', () => {
  test('maps browser coordinates to a weather location', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success) => success({
        coords: { latitude: 28.61, longitude: 77.21, accuracy: 25 },
      })),
    };
    await expect(locateDevice({ geolocation })).resolves.toEqual({
      name: 'Current location',
      country: '',
      latitude: 28.61,
      longitude: 77.21,
      accuracyMeters: 25,
    });
    expect(geolocation.getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 300_000,
    });
  });

  test.each([
    [1, GEOLOCATION_ERROR_CODES.denied],
    [2, GEOLOCATION_ERROR_CODES.unavailable],
    [3, GEOLOCATION_ERROR_CODES.timeout],
  ])('maps browser error %s', async (code, expectedCode) => {
    const geolocation = {
      getCurrentPosition: vi.fn((_success, failure) => failure({ code })),
    };
    await expect(locateDevice({ geolocation })).rejects.toMatchObject({ code: expectedCode });
  });

  test('reports unsupported browsers', async () => {
    await expect(locateDevice({ geolocation: null })).rejects.toBeInstanceOf(GeolocationError);
  });
});

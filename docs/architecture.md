# Architecture

The application uses small modules with one clear responsibility. The browser remains the only runtime process.

## Data flow

1. `WeatherDashboard` sends user actions to `useWeatherDashboard`.
2. The hook calls `openWeatherClient` or `geolocation`.
3. A mapper validates each service response and creates the domain model.
4. `useWeatherIntelligence` calculates daily summaries and planning guidance.
5. React components format and show the domain model.
6. Repositories save locations, notes, observations, dashboards, and settings.

The domain model always stores Celsius and meters per second. Unit conversion occurs only in the display layer.

## Main boundaries

| Directory | Responsibility |
| --- | --- |
| `src/config` | Reads environment values and reports missing service settings. |
| `src/domain` | Contains weather rules, forecasts, alerts, activity scores, health guidance, and unit conversion. |
| `src/services` | Owns HTTP requests, browser access, caching, response mapping, sharing, and data export. |
| `src/storage` | Owns versioned browser storage, data migration, and collection limits. |
| `src/hooks` | Coordinates requests, cancellation, application state, and browser events. |
| `src/components` | Shows data and sends semantic user actions. |
| `src/data` | Supplies deterministic startup data for local use and tests. |

## Error handling

The HTTP client maps network and status errors to `WeatherServiceError`. Components do not inspect raw HTTP responses.

Mappers reject malformed successful responses. The hook keeps the last good weather data after an error.

The cache can supply stale data after a temporary network error. It never hides a canceled request or a missing API key.

## Local data

The JSON store uses one namespace for all browser data. Each repository owns one schema and its capacity rules.

Schema migrations update old settings and saved-location records. Backup imports pass through the public repository normalizers.

Weather snapshots contain selected observations only. The application does not store raw provider responses.

## Weather intelligence

Domain modules calculate daily forecasts, comfort, alert thresholds, commute risk, and activity scores. These modules do not use browser APIs.

The planning scores are advisory values. Official emergency information remains outside this application.

The data-quality module reports stale, incomplete, inconsistent, or mismatched weather data. It does not change provider values.

## Test strategy

Domain and storage modules have focused unit tests. Service tests use injected browser and network adapters.

Hook tests cover request coordination and preserved state. `App.test.jsx` covers the main user workflows through rendered controls.

The full suite uses deterministic dates and service payloads. No test needs an external network request.

# Architecture

The application uses small modules with one clear responsibility. The browser remains the only runtime process.

## Data flow

1. `WeatherDashboard` sends user actions to `useWeatherDashboard`.
2. The hook calls `openWeatherClient` or `geolocation`.
3. A mapper validates each service response and creates the domain model.
4. React components format and show the domain model.
5. Repositories save favorites, recent searches, and display settings.

The domain model always stores Celsius and meters per second. Unit conversion occurs only in the display layer.

## Main boundaries

| Directory | Responsibility |
| --- | --- |
| `src/config` | Reads environment values and reports missing service settings. |
| `src/domain` | Contains weather rules, formatters, condition metadata, and unit conversion. |
| `src/services` | Owns HTTP requests, browser location access, response mapping, and service errors. |
| `src/storage` | Owns versioned browser storage and list capacity rules. |
| `src/hooks` | Coordinates requests, cancellation, application state, and browser events. |
| `src/components` | Shows data and sends semantic user actions. |
| `src/data` | Supplies deterministic startup data for local use and tests. |

## Error handling

The HTTP client maps network and status errors to `WeatherServiceError`. Components do not inspect raw HTTP responses.

Mappers reject malformed successful responses. The hook keeps the last good weather data after an error.

## Test strategy

Domain and storage modules have focused unit tests. Service tests use injected browser and network adapters.

Hook tests cover request coordination and preserved state. `App.test.jsx` covers the main user workflows through rendered controls.

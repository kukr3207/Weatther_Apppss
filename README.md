# Weather Workspace

Weather Workspace is a React dashboard and weather-operations toolkit for personal planning, provider monitoring, forecast analysis, and hazard readiness. It uses the OpenWeather API, deterministic domain services, and local browser storage.

## Features

- Search by city or town.
- Load weather from the device location.
- Show current temperature, humidity, wind, visibility, and pressure.
- Show hourly and daily forecasts with interactive charts.
- Switch between metric and imperial display units.
- Save up to eight favorite locations.
- Keep six recent searches in browser storage.
- Show air quality, pollutant readings, and personal health guidance.
- Derive weather alerts from current conditions and forecasts.
- Rank forecast periods for eight outdoor activities.
- Show commute risk, daylight details, and golden-hour times.
- Build a weather packing list for the next five days.
- Explain wind force, pressure, visibility, and indoor comfort.
- Save location notes and location groups in named dashboards.
- Keep a local history of weather observations.
- Compare the latest observations for multiple locations.
- Export observation history as CSV data.
- Export forecast days as an iCalendar file.
- Export and import workspace settings as a JSON backup.
- Show freshness and consistency notes for weather data.
- Use automatic refresh only while the page is visible.
- Preserve the last visible weather after a request error.
- Disable network actions while the browser is offline.

### Weather operations

- Compare multi-provider forecasts, build consensus periods, and inspect disagreements.
- Verify past forecasts against observations and track error, bias, and reliability.
- Produce short-range nowcasts and alternative forecast scenarios.
- Coordinate retries, request deduplication, caching, offline work, and provider fallback.
- Monitor provider availability, latency, error rates, traces, service objectives, and cost.
- Create forecast watches, notification policies, and stateful alert lifecycles.
- Record operational incidents, shift handoffs, and tamper-evident audit journals.
- Export operational reports as JSON, CSV, Markdown, and restorable backup packages.

### Hazard and environmental analysis

- Assess severe storms, lightning, tropical cyclones, floods, winter weather, and aviation risk.
- Evaluate fire weather, smoke, air quality, pollen, ultraviolet exposure, and heat stress.
- Calculate drought, soil moisture, hydrology, crop, marine, and renewable-energy indicators.
- Build climate normals, detect trends, and compare observations with expected conditions.
- Model asset-level climate risk, adaptation economics, budgeted portfolios, and phased roadmaps.
- Use curated climate, provider, activity, alert-rule, location, and weather-knowledge catalogs.

### Planning and workspace tools

- Plan weather-aware travel routes, activity windows, commutes, and packing lists.
- Build household readiness plans, supply estimates, calendars, and geofence triggers.
- Rank and sync saved places across devices with conflict-aware mutation logs.
- Search an offline global place catalog and use a keyboard-oriented command palette.
- Localize weather measurements, dates, times, layout direction, and unit defaults.
- Explore map layers, radar timelines, viewport bounds, and paged operational records.

## Local setup

Install Node.js 22.22.2 or newer. Then install the dependencies.

```bash
npm ci
cp .env.example .env.local
```

Add an OpenWeather API key to `.env.local`.

```text
VITE_OPENWEATHER_API_KEY=your_key_here
```

Start the development server.

```bash
npm run dev
```

The browser sends the key to OpenWeather. Use a backend proxy before you deploy this application to production.

## Quality commands

```bash
npm run test:ci
npm run build
npm run source:inventory
```

The tests use injected network, browser, clock, and storage adapters. The test suite does not use an OpenWeather quota.

The current suite contains 728 tests across domain, service, storage, operations, hook, and rendered user workflows. The first-party `src` tree contains more than 30,000 substantive lines across application code, styles, and tests, after excluding blank and comment-only lines. Run `npm run source:inventory` to reproduce the inventory without counting dependencies, generated output, or lockfiles.

## Project guide

Read [the architecture guide](docs/architecture.md) before a structural change.

Read [the future task map](docs/future-tasks.md) for 15 additional feature ideas and their extension points.

## Operations package map

The modules under `src/operations` are framework-independent and can be used by the React interface, background workers, or a future API service.

- `alerts` evaluates rules, manages alert state, schedules notifications, and watches forecast changes.
- `coordination` manages audit journals, incidents, handoffs, and provider health.
- `environment` covers climate, air, water, soil, agriculture, energy, marine, and public-health analysis.
- `forecast` provides consensus, verification, nowcasting, scenarios, and adaptive refresh policy.
- `hazards` contains focused severe-weather models with explicit inputs and immutable results.
- `maps` prepares viewport, radar, and layer data without coupling analysis to a map library.
- `observability` aggregates metrics, traces, quality signals, objectives, and dashboards.
- `planning` supports astronomy, trips, activities, commutes, households, and climate adaptation.
- `reports` creates portable operational summaries, exports, and backups.
- `services` normalizes providers and coordinates requests, caches, and offline work.
- `travel` evaluates routes, packing, and safe activity windows.
- `workspace` handles search, ordering, localization, commands, and cross-device reconciliation.

All public calculations validate inputs before producing deeply immutable results. Tests use fixed clocks and local fixtures, so the suite remains deterministic and does not consume an API quota.

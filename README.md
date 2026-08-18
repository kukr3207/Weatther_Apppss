# Weather Workspace

Weather Workspace is a React dashboard for weather research and daily planning. It uses the OpenWeather API and local browser storage.

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
```

The tests use injected network, browser, clock, and storage adapters. The test suite does not use an OpenWeather quota.

The current suite contains 145 tests across domain, service, storage, hook, and rendered user workflows.

## Project guide

Read [the architecture guide](docs/architecture.md) before a structural change.

Read [the future task map](docs/future-tasks.md) for 15 additional feature ideas and their extension points.

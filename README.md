# Weather App

Weather App is a React dashboard for current conditions and hourly forecasts. It uses the OpenWeather API and browser storage.

## Features

- Search by city or town.
- Load weather from the device location.
- Show current temperature, humidity, wind, visibility, and pressure.
- Show the next eight three-hour forecast periods.
- Switch between metric and imperial display units.
- Save up to eight favorite locations.
- Keep six recent searches in browser storage.
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

The browser sends the key to OpenWeather. Use a backend proxy before a production deployment.

## Quality commands

```bash
npm run test:ci
npm run build
```

Tests use injected network, browser, clock, and storage adapters. The test suite does not use an OpenWeather quota.

## Project guide

Read [the architecture guide](docs/architecture.md) before a structural change.

Read [the future task map](docs/future-tasks.md) for 15 independent feature ideas and their extension points.

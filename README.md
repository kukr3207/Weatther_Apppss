# Weather App

A small React app that looks up current weather by city using the OpenWeather API. It shows temperature, humidity, wind speed, loading feedback, and useful errors in a responsive interface.

## Local setup

Requirements: Node.js 22.22 or newer and an [OpenWeather API key](https://openweathermap.org/api).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set your key in `.env.local`:

```text
VITE_OPENWEATHER_API_KEY=your_key_here
```

The key is read from the environment and is not stored in source control. Because this is a browser-only demo, the built application still sends the key from the client; use a backend proxy before deploying it for production use.

## Quality checks

```bash
npm run test:ci
npm run build
```

The tests mock network requests, so they are deterministic and do not consume API quota.

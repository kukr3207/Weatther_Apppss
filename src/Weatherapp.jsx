import { useState } from 'react';
import './Weatherapp.css';
import searchIcon from './search.png';
import clearIcon from './clear.png';
import cloudIcon from './cloud.png';
import drizzleIcon from './drizzle.png';
import humidityIcon from './humidity.png';
import rainIcon from './rain.png';
import snowIcon from './snow.png';
import windIcon from './wind.png';

const DEFAULT_WEATHER = {
  city: 'London',
  temperature: 24,
  humidity: 64,
  windSpeed: 18,
  icon: '02d',
};

function weatherIconFor(code) {
  if (code?.startsWith('01')) return clearIcon;
  if (code?.startsWith('02')) return cloudIcon;
  if (code?.startsWith('03') || code?.startsWith('04')) return drizzleIcon;
  if (code?.startsWith('09') || code?.startsWith('10') || code?.startsWith('11')) return rainIcon;
  if (code?.startsWith('13')) return snowIcon;
  return cloudIcon;
}

function Weatherapp() {
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState(DEFAULT_WEATHER);
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  const search = async (event) => {
    event.preventDefault();
    const city = query.trim();

    if (!city) {
      setStatus({ type: 'error', message: 'Enter a city to search.' });
      return;
    }

    const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
    if (!apiKey) {
      setStatus({
        type: 'error',
        message: 'Weather service is not configured. Add an API key and try again.',
      });
      return;
    }

    setStatus({ type: 'loading', message: `Loading weather for ${city}…` });

    try {
      const params = new URLSearchParams({
        q: city,
        units: 'metric',
        appid: apiKey,
      });
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error(response.status === 404 ? 'City not found.' : 'Weather service unavailable.');
      }

      const data = await response.json();
      const nextWeather = {
        city: data.name,
        temperature: Math.round(data.main.temp),
        humidity: Math.round(data.main.humidity),
        windSpeed: Number(data.wind.speed.toFixed(1)),
        icon: data.weather[0].icon,
      };

      setWeather(nextWeather);
      setQuery('');
      setStatus({ type: 'success', message: `Weather updated for ${nextWeather.city}.` });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load weather.',
      });
    }
  };

  const isLoading = status.type === 'loading';

  return (
    <main className="weather-card">
      <h1>Weather forecast</h1>
      <form className="search-form" role="search" onSubmit={search}>
        <label className="sr-only" htmlFor="city-search">
          City name
        </label>
        <input
          id="city-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a city"
          autoComplete="off"
          disabled={isLoading}
        />
        <button type="submit" aria-label="Search weather" disabled={isLoading}>
          <img src={searchIcon} alt="" aria-hidden="true" />
        </button>
      </form>

      <p
        className={`status-message ${status.type === 'error' ? 'status-error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {status.message}
      </p>

      <section className="current-weather" aria-label={`Current weather in ${weather.city}`}>
        <img
          className="weather-icon"
          src={weatherIconFor(weather.icon)}
          alt={`Weather conditions in ${weather.city}`}
        />
        <p className="weather-temp">{weather.temperature}°C</p>
        <h2 className="weather-location">{weather.city}</h2>

        <div className="weather-details">
          <div className="weather-detail">
            <img src={humidityIcon} alt="" aria-hidden="true" />
            <div>
              <p className="detail-value">{weather.humidity}%</p>
              <p className="detail-label">Humidity</p>
            </div>
          </div>
          <div className="weather-detail">
            <img src={windIcon} alt="" aria-hidden="true" />
            <div>
              <p className="detail-value">{weather.windSpeed} m/s</p>
              <p className="detail-label">Wind speed</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Weatherapp;

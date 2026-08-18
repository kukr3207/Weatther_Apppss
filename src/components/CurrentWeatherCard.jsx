import humidityIcon from '../humidity.png';
import windIcon from '../wind.png';
import { conditionLabel } from '../domain/conditions';
import {
  formatLocationTime,
  formatPercent,
  formatPressure,
  formatVisibility,
  windDirection,
} from '../domain/formatters';
import { formatTemperature, formatWindSpeed } from '../domain/units';
import WeatherIcon from './WeatherIcon';
import WeatherMetric from './WeatherMetric';
import './CurrentWeatherCard.css';

function CurrentWeatherCard({ weather, unitSystem, isFavorite, onToggleFavorite }) {
  if (!weather) return null;

  return (
    <section className="current-card" aria-labelledby="current-location">
      <div className="current-card__heading">
        <div>
          <p className="current-card__eyebrow">
            {formatLocationTime(weather.observedAt, weather.timezoneOffsetSeconds)}
          </p>
          <h2 id="current-location">
            {weather.location.name}, {weather.location.country}
          </h2>
        </div>
        <button
          className="favorite-button"
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={isFavorite}
        >
          <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
          {isFavorite ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="current-card__summary">
        <WeatherIcon
          iconCode={weather.condition.iconCode}
          description={weather.condition.description}
          size="large"
        />
        <div>
          <p className="current-card__temperature">
            {formatTemperature(weather.temperatureC, unitSystem)}
          </p>
          <p className="current-card__condition">
            {conditionLabel(weather.condition.iconCode, weather.condition.description)}
          </p>
          <p className="current-card__feels">
            Feels like {formatTemperature(weather.feelsLikeC, unitSystem)}
          </p>
        </div>
      </div>

      <dl className="current-card__metrics">
        <WeatherMetric
          label="Humidity"
          value={formatPercent(weather.humidityPercent)}
          icon={humidityIcon}
        />
        <WeatherMetric
          label="Wind"
          value={formatWindSpeed(weather.wind.speedMps, unitSystem)}
          detail={windDirection(weather.wind.directionDegrees)}
          icon={windIcon}
        />
        <WeatherMetric label="Visibility" value={formatVisibility(weather.visibilityMeters, unitSystem)} />
        <WeatherMetric label="Pressure" value={formatPressure(weather.pressureHpa)} />
      </dl>
    </section>
  );
}

export default CurrentWeatherCard;

import { formatForecastTime, formatPercent } from '../domain/formatters';
import { formatTemperature } from '../domain/units';
import WeatherIcon from './WeatherIcon';
import './ForecastStrip.css';

function ForecastStrip({ forecast, unitSystem }) {
  if (!forecast?.items?.length) return null;

  return (
    <section className="forecast-panel" aria-labelledby="forecast-title">
      <div className="panel-heading">
        <div>
          <p>Next 24 hours</p>
          <h2 id="forecast-title">Hourly forecast</h2>
        </div>
      </div>
      <ol className="forecast-strip">
        {forecast.items.slice(0, 8).map((item) => (
          <li key={item.forecastAt}>
            <time dateTime={item.forecastAt}>
              {formatForecastTime(item.forecastAt, forecast.location.timezoneOffsetSeconds)}
            </time>
            <WeatherIcon
              iconCode={item.condition.iconCode}
              description={item.condition.description}
              size="small"
            />
            <strong>{formatTemperature(item.temperatureC, unitSystem)}</strong>
            <span>{formatPercent(item.precipitationProbability * 100)} rain</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default ForecastStrip;

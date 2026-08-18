import { describeForecastDay } from '../domain/dailyForecast';
import { formatLocationClock } from '../domain/time';
import { formatPercent } from '../domain/formatters';
import { formatTemperature, formatWindSpeed } from '../domain/units';
import WeatherIcon from './WeatherIcon';

function DailyForecastPanel({ days, unitSystem, timezoneOffsetSeconds = 0 }) {
  if (!days?.length) {
    return (
      <section className="workspace-panel empty-panel" aria-labelledby="daily-forecast-title">
        <h2 id="daily-forecast-title">Daily forecast</h2>
        <p>A daily outlook will appear when forecast data is available.</p>
      </section>
    );
  }

  return (
    <section className="workspace-panel" aria-labelledby="daily-forecast-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Day by day</p>
          <h2 id="daily-forecast-title">Daily forecast</h2>
        </div>
        <span>{days.length} days</span>
      </div>
      <div className="daily-forecast-list">
        {days.map((day, index) => (
          <article className="daily-forecast-row" key={day.dateKey}>
            <div className="daily-forecast-row__date">
              <strong>{index === 0 ? 'Today' : day.label}</strong>
              <span>{describeForecastDay(day)}</span>
            </div>
            <WeatherIcon
              iconCode={day.condition.iconCode}
              description={day.condition.description}
              size="small"
            />
            <div className="daily-forecast-row__temperature" aria-label="Low and high temperature">
              <span>{formatTemperature(day.minimumC, unitSystem)}</span>
              <strong>{formatTemperature(day.maximumC, unitSystem)}</strong>
            </div>
            <dl className="daily-forecast-row__details">
              <div>
                <dt>Rain</dt>
                <dd>{formatPercent(day.precipitationProbability * 100)}</dd>
              </div>
              <div>
                <dt>Wind</dt>
                <dd>{formatWindSpeed(day.maximumWindMps, unitSystem)}</dd>
              </div>
              <div>
                <dt>Warmest</dt>
                <dd>{formatLocationClock(day.warmestAt, timezoneOffsetSeconds)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export default DailyForecastPanel;

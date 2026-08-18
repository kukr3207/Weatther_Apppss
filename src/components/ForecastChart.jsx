import { useId, useMemo, useState } from 'react';
import { normalizeSeries } from '../domain/trends';
import { formatLocationClock } from '../domain/time';
import { formatTemperature, formatWindSpeed } from '../domain/units';

const CHARTS = Object.freeze({
  temperature: {
    label: 'Temperature',
    selector: (item) => item.temperatureC,
    format: (value, units) => formatTemperature(value, units),
    color: '#ffb35c',
  },
  precipitation: {
    label: 'Precipitation',
    selector: (item) => item.precipitationProbability * 100,
    format: (value) => `${Math.round(value)}%`,
    color: '#5bb9f4',
  },
  wind: {
    label: 'Wind',
    selector: (item) => item.windSpeedMps,
    format: (value, units) => formatWindSpeed(value, units),
    color: '#77d6b5',
  },
  humidity: {
    label: 'Humidity',
    selector: (item) => item.humidityPercent,
    format: (value) => `${Math.round(value)}%`,
    color: '#a693f2',
  },
});

function pathFor(series, width, height, padding) {
  const valid = series.filter((point) => point.normalized !== null);
  if (!valid.length) return '';
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  return valid.map((point, position) => {
    const x = padding + (point.index / Math.max(1, series.length - 1)) * usableWidth;
    const y = padding + (1 - point.normalized) * usableHeight;
    return `${position === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function ForecastChart({ forecast, unitSystem }) {
  const [metric, setMetric] = useState('temperature');
  const gradientId = useId().replace(/:/g, '');
  const items = forecast?.items?.slice(0, 16) ?? [];
  const chart = CHARTS[metric];
  const series = useMemo(() => normalizeSeries(items, chart.selector), [chart, items]);
  const width = 760;
  const height = 260;
  const padding = 28;
  const linePath = pathFor(series, width, height, padding);
  const areaPath = linePath
    ? `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`
    : '';

  return (
    <section className="workspace-panel chart-panel" aria-labelledby="forecast-chart-title">
      <div className="workspace-panel__heading chart-panel__heading">
        <div>
          <p>Next 48 hours</p>
          <h2 id="forecast-chart-title">Forecast chart</h2>
        </div>
        <label>
          <span>Chart metric</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {Object.entries(CHARTS).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </label>
      </div>

      {linePath ? (
        <div className="forecast-chart-scroll">
          <svg
            className="forecast-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${chart.label} forecast for the next ${items.length * 3} hours`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={chart.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((position) => (
              <line
                key={position}
                x1={padding}
                x2={width - padding}
                y1={padding + position * (height - padding * 2)}
                y2={padding + position * (height - padding * 2)}
                className="forecast-chart__grid"
              />
            ))}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={chart.color} strokeWidth="4" strokeLinecap="round" />
            {series.map((point) => {
              if (point.normalized === null) return null;
              const x = padding + (point.index / Math.max(1, series.length - 1)) * (width - padding * 2);
              const y = padding + (1 - point.normalized) * (height - padding * 2);
              return <circle key={point.index} cx={x} cy={y} r="4" fill={chart.color} />;
            })}
          </svg>
          <ol className="forecast-chart-values">
            {items.map((item, index) => (
              <li key={item.forecastAt}>
                <time>{formatLocationClock(item.forecastAt, forecast.location.timezoneOffsetSeconds)}</time>
                <strong>{chart.format(chart.selector(item), unitSystem)}</strong>
                {index % 2 === 0 ? <span>{item.condition.description}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : <p className="empty-message">Chart data is not available.</p>}
    </section>
  );
}

export default ForecastChart;

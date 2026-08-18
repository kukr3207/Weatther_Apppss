import { POLLUTANTS } from '../domain/airQuality';
import { formatLocationTime } from '../domain/formatters';

const FEATURED_POLLUTANTS = ['pm2_5', 'pm10', 'no2', 'o3'];

function AirQualityCard({ summary, advice, trend, reading, timezoneOffsetSeconds, profile, onProfileChange }) {
  if (!summary || !reading) {
    return (
      <section className="workspace-panel empty-panel" aria-labelledby="air-quality-title">
        <h2 id="air-quality-title">Air quality</h2>
        <p>Air-quality readings are not available for this location.</p>
      </section>
    );
  }

  return (
    <section className="workspace-panel air-quality-panel" aria-labelledby="air-quality-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Observed {formatLocationTime(reading.observedAt, timezoneOffsetSeconds)}</p>
          <h2 id="air-quality-title">Air quality</h2>
        </div>
        <span className={`air-quality-badge air-quality-badge--${summary.key}`}>
          {summary.index} · {summary.label}
        </span>
      </div>

      <div className="air-quality-summary">
        <div
          className="air-quality-dial"
          style={{ '--air-quality-color': summary.color, '--air-quality-index': summary.index }}
          aria-label={`Air quality index ${summary.index} out of 5`}
        >
          <strong>{summary.index}</strong>
          <span>of 5</span>
        </div>
        <div>
          <h3>{summary.summary}</h3>
          <p>{summary.guidance}</p>
          <p className="air-quality-trend">
            Trend: <strong>{trend.direction}</strong>
          </p>
        </div>
      </div>

      <dl className="pollutant-grid">
        {FEATURED_POLLUTANTS.map((key) => (
          <div key={key}>
            <dt>
              <abbr title={POLLUTANTS[key].label}>{POLLUTANTS[key].shortLabel}</abbr>
            </dt>
            <dd>
              {Number.isFinite(reading.components[key]) ? reading.components[key].toFixed(1) : '–'}
              <span>{POLLUTANTS[key].unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <details className="preference-details">
        <summary>Personalize health guidance</summary>
        <fieldset>
          <legend>Show more cautious advice for</legend>
          {[
            ['asthma', 'Asthma or another breathing condition'],
            ['heartCondition', 'A heart condition'],
            ['child', 'Children'],
            ['olderAdult', 'Older adults'],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={profile[key]}
                onChange={(event) => onProfileChange({ [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </details>

      {advice.length ? (
        <div className="health-advice" aria-labelledby="air-advice-title">
          <h3 id="air-advice-title">Health guidance</h3>
          <ul>{advice.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

export default AirQualityCard;

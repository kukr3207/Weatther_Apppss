import { assessWeatherData } from '../domain/dataQuality';

function DataQualityCard({ current, forecast, airQuality }) {
  const quality = assessWeatherData(current, forecast, airQuality);

  return (
    <section className="workspace-panel quality-panel" aria-labelledby="data-quality-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Freshness and completeness</p>
          <h2 id="data-quality-title">Weather data quality</h2>
        </div>
        <span className={`quality-score quality-score--${quality.grade}`}>
          {quality.score}/100 · {quality.grade}
        </span>
      </div>
      <p className="quality-summary">{quality.summary}</p>
      <dl className="quality-metrics">
        <div>
          <dt>Current observation</dt>
          <dd>{quality.currentAgeMinutes === null ? 'Unknown age' : `${Math.round(quality.currentAgeMinutes)} min old`}</dd>
        </div>
        <div>
          <dt>Forecast coverage</dt>
          <dd>{quality.forecastPeriods} periods</dd>
        </div>
        <div>
          <dt>Air-quality reading</dt>
          <dd>{quality.airAgeMinutes === null ? 'Unavailable' : `${Math.round(quality.airAgeMinutes)} min old`}</dd>
        </div>
      </dl>
      {quality.issues.length ? (
        <ul className="quality-issues">
          {quality.issues.map((item) => (
            <li key={item.id} className={`quality-issue quality-issue--${item.severity}`}>
              <span aria-hidden="true">{item.severity === 'error' ? '!' : 'i'}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default DataQualityCard;

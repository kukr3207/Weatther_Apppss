import { forecastConfidence } from '../domain/forecastConfidence';

function ForecastConfidenceCard({ forecast }) {
  const confidence = forecastConfidence(forecast);
  if (confidence.overall === null) return null;

  return (
    <section className="workspace-panel confidence-panel" aria-labelledby="confidence-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Planning context</p>
          <h2 id="confidence-title">Forecast confidence</h2>
        </div>
        <span className={`confidence-score confidence-score--${confidence.level}`}>
          {confidence.overall}% {confidence.level}
        </span>
      </div>
      <p className="confidence-explanation">{confidence.explanation}</p>
      <ol className="confidence-days">
        {confidence.daily.map((day) => (
          <li key={day.dateKey}>
            <div>
              <strong>{day.label}</strong>
              <span>{day.factors.join(', ')}</span>
            </div>
            <div className="confidence-meter" aria-label={`${day.score}% confidence`}>
              <i style={{ width: `${day.score}%` }} />
            </div>
            <strong>{day.score}%</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default ForecastConfidenceCard;

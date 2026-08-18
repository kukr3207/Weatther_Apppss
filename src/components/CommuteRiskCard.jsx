import { useMemo, useState } from 'react';
import { commuteAdvice, commuteOutlook } from '../domain/commuteRisk';
import { formatTemperature } from '../domain/units';

function CommuteRiskCard({ forecast, unitSystem }) {
  const [mode, setMode] = useState('general');
  const outlook = useMemo(() => commuteOutlook(forecast), [forecast]);
  const selected = outlook.highest;
  const advice = commuteAdvice(selected, mode);

  return (
    <section className="workspace-panel commute-panel" aria-labelledby="commute-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Travel conditions</p>
          <h2 id="commute-title">Commute outlook</h2>
        </div>
        {selected ? <span className={`risk-badge risk-badge--${selected.level}`}>{selected.level} risk</span> : null}
      </div>

      <div className="commute-mode" role="group" aria-label="Travel mode">
        {[
          ['general', 'Any travel'],
          ['driving', 'Driving'],
          ['cycling', 'Cycling'],
          ['walking', 'Walking'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {outlook.periods.length ? (
        <>
          <div className="commute-timeline" aria-label="Travel risk by forecast period">
            {outlook.periods.map((period) => (
              <div key={period.forecastAt} className={`commute-period commute-period--${period.level}`}>
                <time dateTime={period.forecastAt}>{period.label}</time>
                <span style={{ height: `${Math.max(8, period.score)}%` }} aria-hidden="true" />
                <strong>{period.score}</strong>
                <small>{formatTemperature(period.temperatureC, unitSystem)}</small>
              </div>
            ))}
          </div>
          <div className="commute-advice">
            <h3>{outlook.summary}</h3>
            <ul>{advice.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </>
      ) : <p className="empty-message">Forecast data is needed for a travel outlook.</p>}
    </section>
  );
}

export default CommuteRiskCard;

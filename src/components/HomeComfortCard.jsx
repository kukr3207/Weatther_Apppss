import { homeComfortSummary } from '../domain/homeComfort';
import { formatTemperature } from '../domain/units';

function HomeComfortCard({ current, forecast, airQuality, unitSystem }) {
  const summary = homeComfortSummary(current, forecast, airQuality);
  if (!summary) return null;

  return (
    <section className="workspace-panel home-panel" aria-labelledby="home-comfort-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Home planning</p>
          <h2 id="home-comfort-title">Indoor comfort</h2>
        </div>
        <span className={`energy-badge energy-badge--${summary.energy.level}`}>
          {summary.energy.mode} load: {summary.energy.level}
        </span>
      </div>
      <div className="home-comfort-grid">
        <article>
          <span aria-hidden="true">⌂</span>
          <div>
            <h3>Heating and cooling</h3>
            <p>{summary.energy.message}</p>
          </div>
        </article>
        <article>
          <span aria-hidden="true">↔</span>
          <div>
            <h3>Ventilation</h3>
            <p>{summary.ventilation.message}</p>
            {summary.ventilation.best ? <strong>{summary.ventilation.best.score}/100 conditions</strong> : null}
          </div>
        </article>
        <article>
          <span aria-hidden="true">☀</span>
          <div>
            <h3>Outdoor drying</h3>
            <p>{summary.drying.message}</p>
            {summary.drying.best ? <strong>{summary.drying.best.score}/100 conditions</strong> : null}
          </div>
        </article>
        <article>
          <span aria-hidden="true">◌</span>
          <div>
            <h3>Moisture</h3>
            <p>{summary.humidity.label}; dew point {formatTemperature(summary.dewPointC, unitSystem)}.</p>
          </div>
        </article>
      </div>
      <div className="home-actions">
        <h3>Suggested actions</h3>
        <ul>{summary.actions.map((action) => <li key={action}>{action}</li>)}</ul>
      </div>
    </section>
  );
}

export default HomeComfortCard;

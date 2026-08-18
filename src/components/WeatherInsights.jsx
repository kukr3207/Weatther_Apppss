import { formatTemperature } from '../domain/units';

function insightIcon(type) {
  const icons = { comfort: '◉', rain: '☂', trend: '↗', dry: '☀' };
  return icons[type] ?? '•';
}

function WeatherInsights({ intelligence, unitSystem }) {
  const insights = [];
  if (intelligence.comfort) {
    insights.push({
      type: 'comfort',
      title: intelligence.comfort.humidity.label,
      value: `${formatTemperature(intelligence.comfort.dewPointC, unitSystem)} dew point`,
      detail: intelligence.comfort.humidity.advice,
    });
  }
  insights.push({
    type: 'rain',
    title: intelligence.umbrella.label === undefined ? 'Rain plan' : intelligence.umbrella.label,
    value: intelligence.precipitation.likely
      ? `${intelligence.precipitation.totalMm.toFixed(1)} mm forecast`
      : 'No measurable rain',
    detail: intelligence.umbrella.message,
  });
  if (intelligence.trends.highlights[0]) {
    insights.push({
      type: 'trend',
      title: 'Temperature trend',
      value: intelligence.trends.temperature.direction,
      detail: intelligence.trends.highlights[0],
    });
  }
  if (intelligence.dryWindows[0]) {
    insights.push({
      type: 'dry',
      title: 'Best dry stretch',
      value: `${intelligence.dryWindows[0].hours} hours`,
      detail: 'A useful window for errands or outdoor plans.',
    });
  }

  return (
    <section className="workspace-panel" aria-labelledby="insights-title">
      <div className="workspace-panel__heading">
        <div>
          <p>At a glance</p>
          <h2 id="insights-title">Weather insights</h2>
        </div>
      </div>
      <div className="insight-grid">
        {insights.map((insight) => (
          <article key={insight.type} className="insight-card">
            <span className="insight-card__icon" aria-hidden="true">{insightIcon(insight.type)}</span>
            <div>
              <h3>{insight.title}</h3>
              <strong>{insight.value}</strong>
              <p>{insight.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default WeatherInsights;

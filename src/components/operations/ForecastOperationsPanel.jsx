function Metric({ label, value, detail }) {
  return (
    <article className="operations-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function confidenceLabel(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (value >= 85) return 'High confidence';
  if (value >= 65) return 'Moderate confidence';
  return 'Low confidence';
}

function ForecastOperationsPanel({ consensus, nowcast, periods }) {
  const next = consensus?.items?.[0];
  const weakest = [...(consensus?.items ?? [])]
    .sort((first, second) => first.confidence - second.confidence)[0];
  return (
    <div className="operations-grid">
      <section className="operations-card operations-card--wide">
        <header>
          <div>
            <p className="operations-card__eyebrow">Provider consensus</p>
            <h3>Forecast agreement</h3>
          </div>
          <span className={`operations-chip operations-chip--${(consensus?.summary?.averageConfidence ?? 0) >= 70 ? 'good' : 'watch'}`}>
            {confidenceLabel(consensus?.summary?.averageConfidence)}
          </span>
        </header>
        <div className="operations-metrics">
          <Metric label="Average confidence" value={`${consensus?.summary?.averageConfidence ?? '—'}%`} detail={`${consensus?.providerCount ?? 0} sources`} />
          <Metric label="Covered periods" value={consensus?.summary?.coveredPeriods ?? 0} detail={`${consensus?.summary?.completePeriods ?? 0} complete`} />
          <Metric label="Next temperature" value={Number.isFinite(next?.temperatureC) ? `${next.temperatureC} °C` : '—'} detail={`±${next?.disagreement?.temperatureC ?? '—'} °C`} />
          <Metric label="Weakest period" value={Number.isFinite(weakest?.confidence) ? `${weakest.confidence}%` : '—'} detail={weakest?.forecastAt ? new Date(weakest.forecastAt).toLocaleString() : null} />
        </div>
        <div className="operations-provider-list">
          {(consensus?.providers ?? []).map((provider) => (
            <div key={provider.id}>
              <span>{provider.name}</span>
              <meter min="0" max="1" value={provider.reliability}>{provider.reliability}</meter>
              <small>{Math.round(provider.reliability * 100)}% reliability</small>
            </div>
          ))}
        </div>
      </section>

      <section className="operations-card">
        <header>
          <div>
            <p className="operations-card__eyebrow">Next two hours</p>
            <h3>Precipitation nowcast</h3>
          </div>
        </header>
        <div className="operations-nowcast">
          <strong>{nowcast?.summary?.dominantType?.replace('_', ' ') ?? 'Unavailable'}</strong>
          <span>{nowcast?.summary?.totalPrecipitationMm ?? 0} mm expected</span>
          <div className="operations-nowcast__bars" aria-label="Precipitation intensity by period">
            {(nowcast?.periods ?? []).slice(0, 12).map((period) => (
              <i
                key={period.forecastAt}
                title={`${period.minutesFromNow} minutes: ${period.precipitationRateMmPerHour} mm/h`}
                style={{ height: `${Math.max(4, Math.min(100, period.precipitationRateMmPerHour * 8))}%` }}
              />
            ))}
          </div>
          <small>{nowcast?.confidence ?? 0}% nowcast confidence</small>
        </div>
      </section>

      <section className="operations-card">
        <header>
          <div>
            <p className="operations-card__eyebrow">Coverage</p>
            <h3>Forecast timeline</h3>
          </div>
        </header>
        <ol className="operations-timeline">
          {periods.slice(0, 5).map((period) => (
            <li key={period.forecastAt}>
              <time>{new Date(period.forecastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              <span>{period.condition?.description ?? 'Conditions unavailable'}</span>
              <strong>{Math.round(period.temperatureC)}°</strong>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default ForecastOperationsPanel;

function RiskGauge({ label, value, maximum = 100, detail }) {
  const numeric = Number.isFinite(value) ? value : 0;
  const tone = numeric / maximum >= 0.7 ? 'danger' : numeric / maximum >= 0.4 ? 'watch' : 'good';
  return (
    <article className={`risk-gauge risk-gauge--${tone}`}>
      <header>
        <span>{label}</span>
        <strong>{Number.isFinite(value) ? value : '—'}</strong>
      </header>
      <div role="progressbar" aria-valuenow={numeric} aria-valuemin="0" aria-valuemax={maximum}>
        <i style={{ width: `${Math.max(0, Math.min(100, numeric / maximum * 100))}%` }} />
      </div>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function RiskOverviewPanel({ air, pollen, thermal, agriculture, energy }) {
  return (
    <div className="operations-grid">
      <section className="operations-card operations-card--wide">
        <header>
          <div>
            <p className="operations-card__eyebrow">Personal exposure</p>
            <h3>Health risk overview</h3>
          </div>
        </header>
        <div className="risk-grid">
          <RiskGauge label="Air quality" value={air?.aqi} maximum={500} detail={air?.category?.label ?? 'No reading'} />
          <RiskGauge label="Pollen" value={pollen?.risk} maximum={5} detail={pollen?.dominant?.join(', ') || 'Low pollen'} />
          <RiskGauge label="Heat stress" value={thermal?.maximumHeatRisk} detail="Peak in forecast" />
          <RiskGauge label="Cold stress" value={thermal?.maximumColdRisk} detail="Peak in forecast" />
        </div>
      </section>

      <section className="operations-card">
        <header>
          <div>
            <p className="operations-card__eyebrow">Growing conditions</p>
            <h3>Garden outlook</h3>
          </div>
        </header>
        <dl className="operations-definition-list">
          <div><dt>Tomato degree days</dt><dd>{agriculture?.degreeDays?.total ?? '—'}</dd></div>
          <div><dt>Risk days</dt><dd>{agriculture?.risks?.riskDays ?? 0}</dd></div>
          <div><dt>Lowest temperature</dt><dd>{agriculture?.risks?.lowestTemperatureC ?? '—'} °C</dd></div>
          <div><dt>Highest temperature</dt><dd>{agriculture?.risks?.highestTemperatureC ?? '—'} °C</dd></div>
        </dl>
      </section>

      <section className="operations-card">
        <header>
          <div>
            <p className="operations-card__eyebrow">Renewable potential</p>
            <h3>Local generation</h3>
          </div>
        </header>
        <dl className="operations-definition-list">
          <div><dt>Solar forecast</dt><dd>{energy?.solar?.totalGenerationKwh ?? '—'} kWh</dd></div>
          <div><dt>Solar peak</dt><dd>{energy?.solar?.peakGenerationKwh ?? '—'} kWh</dd></div>
          <div><dt>Wind forecast</dt><dd>{energy?.wind?.totalGenerationKwh ?? '—'} kWh</dd></div>
          <div><dt>Turbine hours</dt><dd>{energy?.wind?.operatingHours ?? '—'}</dd></div>
        </dl>
      </section>
    </div>
  );
}

export default RiskOverviewPanel;

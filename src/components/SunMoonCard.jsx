function SunMoonCard({ solar }) {
  if (!solar) return null;
  const duration = solar.duration
    ? `${solar.duration.hours} hr ${solar.duration.remainingMinutes} min`
    : 'Unavailable';
  const progress = Math.round((solar.progress?.progress ?? 0) * 100);

  return (
    <section className="workspace-panel sun-panel" aria-labelledby="sun-moon-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Light and sky</p>
          <h2 id="sun-moon-title">Sun and moon</h2>
        </div>
        <span>{solar.moon?.symbol} {solar.moon?.name}</span>
      </div>

      <div className="sun-progress" aria-label={`${progress}% of today's daylight has passed`}>
        <div className="sun-progress__track">
          <span style={{ left: `${progress}%` }} aria-hidden="true">☀</span>
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="sun-progress__labels">
          <span><strong>Sunrise</strong>{solar.sunriseLabel}</span>
          <span><strong>Daylight</strong>{duration}</span>
          <span><strong>Sunset</strong>{solar.sunsetLabel}</span>
        </div>
      </div>

      <div className="golden-hour-grid">
        {solar.goldenHours.map((window) => (
          <article key={window.id}>
            <span aria-hidden="true">◐</span>
            <div>
              <h3>{window.label}</h3>
              <p>{window.startLabel}–{window.endLabel}</p>
            </div>
          </article>
        ))}
        <article>
          <span aria-hidden="true">{solar.moon?.symbol}</span>
          <div>
            <h3>{solar.moon?.name}</h3>
            <p>{Math.round((solar.moon?.illumination ?? 0) * 100)}% illuminated</p>
          </div>
        </article>
      </div>
    </section>
  );
}

export default SunMoonCard;

function TravelReadinessPanel({ packing, activities, location }) {
  return (
    <div className="operations-grid">
      <section className="operations-card operations-card--wide">
        <header>
          <div>
            <p className="operations-card__eyebrow">Suggested equipment</p>
            <h3>Packing for {location?.name ?? 'this forecast'}</h3>
          </div>
          <span className="operations-chip">{packing?.items?.length ?? 0} items</span>
        </header>
        <div className="packing-categories">
          {Object.entries(packing?.byCategory ?? {}).map(([category, items]) => (
            <section key={category}>
              <h4>{category}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <small>{item.reasons.join(', ').replaceAll('_', ' ')}</small>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="operations-card operations-card--wide">
        <header>
          <div>
            <p className="operations-card__eyebrow">Outdoor planning</p>
            <h3>Best walking windows</h3>
          </div>
        </header>
        <div className="activity-windows">
          {activities.map((window) => (
            <article key={window.startsAt}>
              <div className={`activity-windows__score activity-windows__score--${window.rating}`}>
                {window.score}
              </div>
              <div>
                <strong>{new Date(window.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric' })}</strong>
                <span>{window.rating} conditions</span>
                {window.reasons[0] ? <small>{window.reasons[0]}</small> : <small>No significant constraints.</small>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default TravelReadinessPanel;

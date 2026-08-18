import { useMemo } from 'react';
import { rankLocations } from '../domain/locationComparison';
import { formatTemperature, formatWindSpeed } from '../domain/units';

function snapshotsForLatestLocations(snapshots) {
  const byLocation = new Map();
  snapshots.forEach((snapshot) => {
    if (!byLocation.has(snapshot.location.id)) byLocation.set(snapshot.location.id, snapshot);
  });
  return [...byLocation.values()].map((snapshot) => ({
    current: {
      location: snapshot.location,
      observedAt: snapshot.recordedAt,
      temperatureC: snapshot.temperatureC,
      feelsLikeC: snapshot.feelsLikeC,
      humidityPercent: snapshot.humidityPercent,
      pressureHpa: snapshot.pressureHpa,
      visibilityMeters: snapshot.visibilityMeters,
      wind: { speedMps: snapshot.windSpeedMps },
      condition: { description: snapshot.condition, iconCode: '01d' },
    },
    airQuality: snapshot.airQualityIndex ? { index: snapshot.airQualityIndex } : null,
    forecast: { location: snapshot.location, items: [] },
  }));
}

function LocationComparisonPanel({ snapshots, unitSystem }) {
  const ranked = useMemo(() => rankLocations(snapshotsForLatestLocations(snapshots)), [snapshots]);

  return (
    <section className="workspace-panel comparison-panel" aria-labelledby="comparison-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Latest saved observations</p>
          <h2 id="comparison-title">Compare locations</h2>
        </div>
        <span>{ranked.length} places</span>
      </div>

      {ranked.length >= 2 ? (
        <div className="comparison-grid">
          {ranked.map((snapshot, index) => (
            <article key={snapshot.id} className={index === 0 ? 'comparison-card comparison-card--best' : 'comparison-card'}>
              <div className="comparison-card__heading">
                <div>
                  {index === 0 ? <span>Best match</span> : null}
                  <h3>{snapshot.location.name}</h3>
                  <p>{snapshot.location.country}</p>
                </div>
                <strong>{snapshot.score}<small>/100</small></strong>
              </div>
              <p className="comparison-card__temperature">
                {formatTemperature(snapshot.current.temperatureC, unitSystem)}
              </p>
              <p>{snapshot.current.condition.description || 'Conditions unavailable'}</p>
              <dl>
                <div><dt>Humidity</dt><dd>{Math.round(snapshot.current.humidityPercent)}%</dd></div>
                <div><dt>Wind</dt><dd>{formatWindSpeed(snapshot.current.wind.speedMps, unitSystem)}</dd></div>
                <div><dt>Air quality</dt><dd>{snapshot.airQuality?.index ?? '–'} / 5</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-message">
          Visit and refresh at least two locations. Their latest observations will appear here for comparison.
        </p>
      )}
    </section>
  );
}

export default LocationComparisonPanel;

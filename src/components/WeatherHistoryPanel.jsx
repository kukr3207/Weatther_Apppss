import { formatLocationDate, formatLocationClock } from '../domain/time';
import { formatPressure } from '../domain/formatters';
import { formatTemperature, formatWindSpeed } from '../domain/units';
import { downloadCsv, snapshotCsvFileName, snapshotsToCsv } from '../services/snapshotCsv';

function WeatherHistoryPanel({ snapshots, activeLocation, unitSystem, onClear }) {
  const locationSnapshots = activeLocation
    ? snapshots.filter((snapshot) => snapshot.location.id === activeLocation.id)
    : [];

  function exportHistory() {
    if (!locationSnapshots.length) return;
    downloadCsv(snapshotsToCsv(locationSnapshots), snapshotCsvFileName(activeLocation));
  }

  return (
    <section className="workspace-panel history-panel" aria-labelledby="weather-history-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Saved automatically after updates</p>
          <h2 id="weather-history-title">Observation history</h2>
        </div>
        <div className="history-panel__actions">
          <button type="button" className="button-link" disabled={!locationSnapshots.length} onClick={exportHistory}>
            Export CSV
          </button>
          <button type="button" className="button-link" disabled={!snapshots.length} onClick={onClear}>
            Clear all
          </button>
        </div>
      </div>

      {locationSnapshots.length ? (
        <div className="history-table-scroll">
          <table>
            <caption className="visually-hidden">Weather observations for {activeLocation.name}</caption>
            <thead>
              <tr>
                <th scope="col">Recorded</th>
                <th scope="col">Conditions</th>
                <th scope="col">Temperature</th>
                <th scope="col">Humidity</th>
                <th scope="col">Wind</th>
                <th scope="col">Pressure</th>
                <th scope="col">AQI</th>
              </tr>
            </thead>
            <tbody>
              {locationSnapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>
                    <time dateTime={snapshot.recordedAt}>
                      {formatLocationDate(snapshot.recordedAt)}<br />
                      {formatLocationClock(snapshot.recordedAt)}
                    </time>
                  </td>
                  <td>{snapshot.condition || 'Unknown'}</td>
                  <td>{formatTemperature(snapshot.temperatureC, unitSystem)}</td>
                  <td>{Number.isFinite(snapshot.humidityPercent) ? `${Math.round(snapshot.humidityPercent)}%` : '–'}</td>
                  <td>{formatWindSpeed(snapshot.windSpeedMps, unitSystem)}</td>
                  <td>{formatPressure(snapshot.pressureHpa)}</td>
                  <td>{snapshot.airQualityIndex ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-message">Refresh this location to begin its local observation history.</p>
      )}
    </section>
  );
}

export default WeatherHistoryPanel;

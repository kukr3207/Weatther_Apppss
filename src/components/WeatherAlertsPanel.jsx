import { useState } from 'react';
import { ALERT_SEVERITIES } from '../domain/weatherAlerts';
import { formatLocationDate, formatLocationClock } from '../domain/time';

function alertTime(alert, offsetSeconds) {
  if (!alert.startsAt) return 'Current conditions';
  return `${formatLocationDate(alert.startsAt, offsetSeconds)} at ${formatLocationClock(alert.startsAt, offsetSeconds)}`;
}

function WeatherAlertsPanel({ alerts, allAlerts, preferences, onPreferencesChange, timezoneOffsetSeconds }) {
  const [expanded, setExpanded] = useState(null);
  const hiddenCount = Math.max(0, allAlerts.length - alerts.length);

  return (
    <section className="workspace-panel alerts-panel" aria-labelledby="alerts-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Forecast-based guidance</p>
          <h2 id="alerts-title">Weather alerts</h2>
        </div>
        <span>{alerts.length} active</span>
      </div>

      {alerts.length ? (
        <ol className="alert-list">
          {alerts.map((alert) => {
            const isExpanded = expanded === alert.id;
            return (
              <li key={alert.id} className={`weather-alert weather-alert--${alert.severity}`}>
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : alert.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="weather-alert__severity">
                    {ALERT_SEVERITIES[alert.severity]?.label ?? 'Advisory'}
                  </span>
                  <strong>{alert.title}</strong>
                  <time dateTime={alert.startsAt ?? undefined}>{alertTime(alert, timezoneOffsetSeconds)}</time>
                  <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded ? (
                  <div className="weather-alert__details">
                    <p>{alert.message}</p>
                    <span>Source: {alert.source}</span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="all-clear-message">
          <span aria-hidden="true">✓</span>
          <div>
            <h3>No active weather alerts</h3>
            <p>The current forecast does not cross your selected alert thresholds.</p>
          </div>
        </div>
      )}

      <details className="preference-details">
        <summary>Alert preferences{hiddenCount ? ` (${hiddenCount} hidden)` : ''}</summary>
        <label className="select-field">
          <span>Minimum severity</span>
          <select
            value={preferences.minimumSeverity}
            onChange={(event) => onPreferencesChange({ minimumSeverity: event.target.value })}
          >
            <option value="info">All advisories</option>
            <option value="watch">Watches and above</option>
            <option value="warning">Warnings and above</option>
            <option value="emergency">Emergencies only</option>
          </select>
        </label>
      </details>
      <p className="panel-disclaimer">Forecast alerts are planning guidance, not official emergency warnings.</p>
    </section>
  );
}

export default WeatherAlertsPanel;

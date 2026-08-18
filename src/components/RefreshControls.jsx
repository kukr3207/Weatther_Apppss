import { formatLocationDate, formatLocationClock } from '../domain/time';

function RefreshControls({ observedAt, timezoneOffsetSeconds, onRefresh, disabled, autoRefreshMinutes }) {
  const observed = observedAt
    ? `${formatLocationDate(observedAt, timezoneOffsetSeconds)} at ${formatLocationClock(observedAt, timezoneOffsetSeconds)}`
    : 'Not available';

  return (
    <div className="refresh-controls" aria-label="Weather update controls">
      <div>
        <span>Last observation</span>
        <strong>{observed}</strong>
        <small>Auto-refresh every {autoRefreshMinutes} minutes while this page is visible</small>
      </div>
      <button type="button" onClick={onRefresh} disabled={disabled}>
        <span aria-hidden="true">↻</span>
        {disabled ? 'Updating…' : 'Refresh now'}
      </button>
    </div>
  );
}

export default RefreshControls;

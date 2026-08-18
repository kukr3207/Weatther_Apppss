import { ACTIVITIES, planActivity } from '../domain/activityPlanner';
import { formatLocationDate, formatLocationClock } from '../domain/time';
import { formatPercent } from '../domain/formatters';
import { formatTemperature, formatWindSpeed } from '../domain/units';

function ActivityPlanner({ forecast, preferences, onPreferencesChange, unitSystem }) {
  const plan = planActivity(forecast, preferences.selectedActivity, { limit: 6 });
  const offset = forecast?.location?.timezoneOffsetSeconds ?? 0;

  return (
    <section className="workspace-panel activity-panel" aria-labelledby="activity-planner-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Weather-aware timing</p>
          <h2 id="activity-planner-title">Activity planner</h2>
        </div>
      </div>

      <div className="activity-picker" role="radiogroup" aria-label="Choose an outdoor activity">
        {ACTIVITIES.map((activity) => (
          <label key={activity.id}>
            <input
              type="radio"
              name="activity"
              value={activity.id}
              checked={activity.id === preferences.selectedActivity}
              onChange={() => onPreferencesChange({ selectedActivity: activity.id })}
            />
            <span aria-hidden="true">{activity.icon}</span>
            <strong>{activity.name}</strong>
          </label>
        ))}
      </div>

      {plan.periods.length ? (
        <div className="activity-periods">
          <h3>Best times for {plan.activity.name.toLowerCase()}</h3>
          <ol>
            {plan.periods.map((period, index) => (
              <li key={period.forecastAt} className={`activity-period activity-period--${period.rating}`}>
                <div className="activity-period__score">
                  <strong>{period.score}</strong>
                  <span>/100</span>
                </div>
                <div>
                  <h4>{index === 0 ? 'Best match' : period.rating}</h4>
                  <time dateTime={period.forecastAt}>
                    {formatLocationDate(period.forecastAt, offset)} · {formatLocationClock(period.forecastAt, offset)}
                  </time>
                  <p>{period.reasons.join(' · ')}</p>
                </div>
                <dl>
                  <div><dt>Temp</dt><dd>{formatTemperature(period.temperatureC, unitSystem)}</dd></div>
                  <div><dt>Rain</dt><dd>{formatPercent(period.precipitationProbability * 100)}</dd></div>
                  <div><dt>Wind</dt><dd>{formatWindSpeed(period.windSpeedMps, unitSystem)}</dd></div>
                </dl>
              </li>
            ))}
          </ol>
        </div>
      ) : <p className="empty-message">Forecast periods are needed to plan an activity.</p>}
    </section>
  );
}

export default ActivityPlanner;

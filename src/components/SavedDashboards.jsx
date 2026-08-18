import { useState } from 'react';

function SavedDashboards({ dashboards, activeLocation, onCreate, onRemove, onAddLocation, onSelectLocation }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  function create(event) {
    event.preventDefault();
    try {
      const dashboard = onCreate(name);
      setName('');
      setMessage(`${dashboard.name} created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create the dashboard.');
    }
  }

  return (
    <section className="workspace-panel dashboards-panel" aria-labelledby="saved-dashboards-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Location collections</p>
          <h2 id="saved-dashboards-title">Saved dashboards</h2>
        </div>
        <span>{dashboards.length}/6</span>
      </div>

      <form className="inline-form" onSubmit={create}>
        <label htmlFor="dashboard-name">New dashboard name</label>
        <div>
          <input
            id="dashboard-name"
            value={name}
            maxLength={40}
            placeholder="Weekend travel"
            onChange={(event) => {
              setName(event.target.value);
              setMessage('');
            }}
          />
          <button type="submit" disabled={!name.trim() || dashboards.length >= 6}>Create</button>
        </div>
      </form>

      {dashboards.length ? (
        <div className="dashboard-collection-list">
          {dashboards.map((dashboard) => {
            const containsActive = activeLocation
              && dashboard.locations.some((location) => location.id === activeLocation.id);
            return (
              <article key={dashboard.id}>
                <div className="dashboard-collection__heading">
                  <div>
                    <h3>{dashboard.name}</h3>
                    <p>{dashboard.locations.length}/6 locations</p>
                  </div>
                  <button type="button" className="button-link" onClick={() => onRemove(dashboard.id)}>
                    Remove
                  </button>
                </div>
                {dashboard.locations.length ? (
                  <ul>
                    {dashboard.locations.map((location) => (
                      <li key={location.id}>
                        <button type="button" onClick={() => onSelectLocation(location)}>
                          <strong>{location.name}</strong>
                          <span>{location.state || location.country}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="empty-message">No locations saved here yet.</p>}
                <button
                  type="button"
                  className="button-secondary dashboard-collection__add"
                  disabled={!activeLocation || containsActive || dashboard.locations.length >= 6}
                  onClick={() => onAddLocation(dashboard.id)}
                >
                  {containsActive ? 'Current location added' : `Add ${activeLocation?.name ?? 'current location'}`}
                </button>
              </article>
            );
          })}
        </div>
      ) : <p className="empty-message">Create a dashboard to group places for trips, family, or work.</p>}
      <p className="sr-status" role="status">{message}</p>
    </section>
  );
}

export default SavedDashboards;

import './LocationLists.css';

function FavoriteLocations({ favorites, activeLocation, onSelect, onRemove }) {
  return (
    <section className="location-list" aria-labelledby="favorites-title">
      <div className="location-list__heading">
        <h2 id="favorites-title">Saved places</h2>
        <span>{favorites.length}/8</span>
      </div>
      {favorites.length === 0 ? (
        <p className="location-list__empty">Save a place to reach it quickly.</p>
      ) : (
        <ul>
          {favorites.map((location) => (
            <li key={location.id}>
              <button
                type="button"
                className="location-list__select"
                onClick={() => onSelect(location)}
                aria-current={activeLocation?.id === location.id ? 'location' : undefined}
              >
                <strong>{location.name}</strong>
                <span>{[location.state, location.country].filter(Boolean).join(', ')}</span>
              </button>
              <button
                type="button"
                className="location-list__remove"
                onClick={() => onRemove(location.id)}
                aria-label={`Remove ${location.name} from saved places`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default FavoriteLocations;

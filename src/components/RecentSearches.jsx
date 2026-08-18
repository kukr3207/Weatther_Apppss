import './LocationLists.css';

function RecentSearches({ searches, onSelect, onClear }) {
  if (searches.length === 0) return null;

  return (
    <section className="location-list" aria-labelledby="recent-title">
      <div className="location-list__heading">
        <h2 id="recent-title">Recent searches</h2>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      <ul>
        {searches.map((location) => (
          <li key={location.id}>
            <button
              type="button"
              className="location-list__select"
              onClick={() => onSelect(location)}
            >
              <strong>{location.name}</strong>
              <span>{[location.state, location.country].filter(Boolean).join(', ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RecentSearches;

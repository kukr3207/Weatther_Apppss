import { useState } from 'react';
import searchIcon from '../search.png';
import './SearchForm.css';

function SearchForm({ onSearch, disabled = false, initialValue = '' }) {
  const [query, setQuery] = useState(initialValue);

  function submit(event) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    onSearch(normalized);
  }

  return (
    <form className="location-search" role="search" onSubmit={submit}>
      <label htmlFor="location-query">Search for a location</label>
      <div className="location-search__controls">
        <input
          id="location-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="City or town"
          autoComplete="off"
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !query.trim()}>
          <img src={searchIcon} alt="" aria-hidden="true" />
          <span>Search</span>
        </button>
      </div>
    </form>
  );
}

export default SearchForm;

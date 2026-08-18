import CurrentWeatherCard from './CurrentWeatherCard';
import FavoriteLocations from './FavoriteLocations';
import ForecastStrip from './ForecastStrip';
import RecentSearches from './RecentSearches';
import SearchForm from './SearchForm';
import StatusBanner from './StatusBanner';
import UnitToggle from './UnitToggle';
import { useWeatherDashboard } from '../hooks/useWeatherDashboard';
import './WeatherDashboard.css';

function WeatherDashboard({ dashboardOptions }) {
  const dashboard = useWeatherDashboard(dashboardOptions);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-header__eyebrow">Weather workspace</p>
          <h1>Forecast dashboard</h1>
        </div>
        <UnitToggle
          value={dashboard.settings.unitSystem}
          onChange={dashboard.setUnitSystem}
          disabled={dashboard.isLoading}
        />
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar" aria-label="Location controls">
          <SearchForm onSearch={dashboard.search} disabled={dashboard.isLoading} />
          <StatusBanner status={dashboard.status} />
          <FavoriteLocations
            favorites={dashboard.favorites}
            activeLocation={dashboard.activeLocation}
            onSelect={dashboard.selectLocation}
            onRemove={dashboard.removeFavorite}
          />
          <RecentSearches
            searches={dashboard.recentSearches}
            onSelect={dashboard.selectLocation}
            onClear={dashboard.clearRecentSearches}
          />
        </aside>

        <div className="dashboard-content">
          <CurrentWeatherCard
            weather={dashboard.current}
            unitSystem={dashboard.settings.unitSystem}
            isFavorite={dashboard.isFavorite}
            onToggleFavorite={dashboard.toggleFavorite}
          />
          <ForecastStrip forecast={dashboard.forecast} unitSystem={dashboard.settings.unitSystem} />
        </div>
      </div>
    </main>
  );
}

export default WeatherDashboard;

import { useState } from 'react';
import ActivityPlanner from './ActivityPlanner';
import AirQualityCard from './AirQualityCard';
import CurrentWeatherCard from './CurrentWeatherCard';
import CommuteRiskCard from './CommuteRiskCard';
import DetailedConditionsCard from './DetailedConditionsCard';
import DailyForecastPanel from './DailyForecastPanel';
import DashboardTabs from './DashboardTabs';
import DataSettingsPanel from './DataSettingsPanel';
import DataQualityCard from './DataQualityCard';
import FavoriteLocations from './FavoriteLocations';
import ForecastStrip from './ForecastStrip';
import HomeComfortCard from './HomeComfortCard';
import ForecastChart from './ForecastChart';
import ForecastConfidenceCard from './ForecastConfidenceCard';
import LocateButton from './LocateButton';
import NetworkBanner from './NetworkBanner';
import LocationComparisonPanel from './LocationComparisonPanel';
import LocationNoteCard from './LocationNoteCard';
import PackingGuideCard from './PackingGuideCard';
import RecentSearches from './RecentSearches';
import SearchForm from './SearchForm';
import SavedDashboards from './SavedDashboards';
import StatusBanner from './StatusBanner';
import SunMoonCard from './SunMoonCard';
import UnitToggle from './UnitToggle';
import WeatherAlertsPanel from './WeatherAlertsPanel';
import WeatherHistoryPanel from './WeatherHistoryPanel';
import WeatherInsights from './WeatherInsights';
import RefreshControls from './RefreshControls';
import { useWeatherDashboard } from '../hooks/useWeatherDashboard';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useWeatherIntelligence } from '../hooks/useWeatherIntelligence';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useTheme } from '../hooks/useTheme';
import './WeatherDashboard.css';
import './WorkspacePanels.css';

function WeatherDashboard({ dashboardOptions }) {
  const dashboard = useWeatherDashboard(dashboardOptions);
  const online = useOnlineStatus();
  const [activeTab, setActiveTab] = useState('overview');
  useTheme(dashboard.settings.theme);
  useAutoRefresh(dashboard.refresh, {
    enabled: online && !dashboard.isLoading,
    minutes: dashboard.settings.refreshMinutes,
  });
  const intelligence = useWeatherIntelligence({
    current: dashboard.current,
    forecast: dashboard.forecast,
    airQuality: dashboard.airQuality,
    airQualityForecast: dashboard.airQualityForecast,
    providerAlerts: dashboard.providerAlerts,
    alertPreferences: dashboard.alertPreferences,
    healthProfile: dashboard.healthProfile,
    plannerPreferences: dashboard.plannerPreferences,
  });

  function panel(content) {
    return (
      <div
        id={`workspace-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`workspace-tab-${activeTab}`}
        className="dashboard-content"
        tabIndex={0}
      >
        {content}
      </div>
    );
  }

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
      <NetworkBanner online={online} />
      <DashboardTabs activeTab={activeTab} onChange={setActiveTab} alerts={intelligence.alerts.length} />

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar" aria-label="Location controls">
          <SearchForm onSearch={dashboard.search} disabled={dashboard.isLoading || !online} />
          <LocateButton onLocate={dashboard.locate} disabled={dashboard.isLoading || !online} />
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

        {activeTab === 'overview' ? panel(<>
          <RefreshControls
            observedAt={dashboard.current?.observedAt}
            timezoneOffsetSeconds={dashboard.current?.timezoneOffsetSeconds}
            onRefresh={dashboard.refresh}
            disabled={dashboard.isLoading || !online}
            autoRefreshMinutes={dashboard.settings.refreshMinutes}
          />
          <CurrentWeatherCard
            weather={dashboard.current}
            unitSystem={dashboard.settings.unitSystem}
            isFavorite={dashboard.isFavorite}
            onToggleFavorite={dashboard.toggleFavorite}
          />
          <WeatherInsights intelligence={intelligence} unitSystem={dashboard.settings.unitSystem} />
          <DetailedConditionsCard weather={dashboard.current} />
          <ForecastStrip forecast={dashboard.forecast} unitSystem={dashboard.settings.unitSystem} />
        </>) : null}

        {activeTab === 'forecast' ? panel(<>
          <DailyForecastPanel
            days={intelligence.daily}
            unitSystem={dashboard.settings.unitSystem}
            timezoneOffsetSeconds={dashboard.forecast?.location?.timezoneOffsetSeconds}
          />
          <ForecastChart forecast={dashboard.forecast} unitSystem={dashboard.settings.unitSystem} />
          <ForecastConfidenceCard forecast={dashboard.forecast} />
          <ForecastStrip forecast={dashboard.forecast} unitSystem={dashboard.settings.unitSystem} />
        </>) : null}

        {activeTab === 'health' ? panel(<>
          <AirQualityCard
            summary={intelligence.air}
            advice={intelligence.airAdvice}
            trend={intelligence.airTrend}
            reading={dashboard.airQuality}
            timezoneOffsetSeconds={dashboard.current?.timezoneOffsetSeconds}
            profile={dashboard.healthProfile}
            onProfileChange={dashboard.updateHealthProfile}
          />
          <WeatherAlertsPanel
            alerts={intelligence.alerts}
            allAlerts={intelligence.allAlerts}
            preferences={dashboard.alertPreferences}
            onPreferencesChange={dashboard.updateAlertPreferences}
            timezoneOffsetSeconds={dashboard.current?.timezoneOffsetSeconds}
          />
        </>) : null}

        {activeTab === 'planner' ? panel(<>
          <ActivityPlanner
            forecast={dashboard.forecast}
            preferences={dashboard.plannerPreferences}
            onPreferencesChange={dashboard.updatePlannerPreferences}
            unitSystem={dashboard.settings.unitSystem}
          />
          <SunMoonCard solar={intelligence.solar} />
          <CommuteRiskCard forecast={dashboard.forecast} unitSystem={dashboard.settings.unitSystem} />
          <HomeComfortCard
            current={dashboard.current}
            forecast={dashboard.forecast}
            airQuality={dashboard.airQuality}
            unitSystem={dashboard.settings.unitSystem}
          />
          <PackingGuideCard
            forecast={dashboard.forecast}
            airQuality={dashboard.airQuality}
            location={dashboard.activeLocation}
            unitSystem={dashboard.settings.unitSystem}
          />
        </>) : null}

        {activeTab === 'places' ? panel(<>
          <LocationNoteCard
            location={dashboard.activeLocation}
            note={dashboard.activeNote}
            onSave={dashboard.saveNote}
            onRemove={dashboard.removeNote}
          />
          <SavedDashboards
            dashboards={dashboard.dashboards}
            activeLocation={dashboard.activeLocation}
            onCreate={dashboard.createDashboard}
            onRemove={dashboard.removeDashboard}
            onAddLocation={dashboard.addLocationToDashboard}
            onSelectLocation={dashboard.selectLocation}
          />
          <LocationComparisonPanel snapshots={dashboard.snapshots} unitSystem={dashboard.settings.unitSystem} />
          <WeatherHistoryPanel
            snapshots={dashboard.snapshots}
            activeLocation={dashboard.activeLocation}
            unitSystem={dashboard.settings.unitSystem}
            onClear={dashboard.clearSnapshots}
          />
        </>) : null}

        {activeTab === 'settings' ? panel(
          <>
            <DataSettingsPanel dashboard={dashboard} onImport={dashboard.importWorkspace} />
            <DataQualityCard
              current={dashboard.current}
              forecast={dashboard.forecast}
              airQuality={dashboard.airQuality}
            />
          </>,
        ) : null}
      </div>
    </main>
  );
}

export default WeatherDashboard;

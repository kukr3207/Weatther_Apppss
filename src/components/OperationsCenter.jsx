import { useMemo, useState } from 'react';
import ForecastOperationsPanel from './operations/ForecastOperationsPanel';
import RiskOverviewPanel from './operations/RiskOverviewPanel';
import TravelReadinessPanel from './operations/TravelReadinessPanel';
import WorkspaceCommandPalette from './operations/WorkspaceCommandPalette';
import OperationalRecordsPanel from './operations/OperationalRecordsPanel';
import { buildForecastConsensus } from '../operations/forecast/consensus';
import { createPrecipitationNowcast } from '../operations/forecast/nowcast';
import { assessPollenReading } from '../operations/environment/pollen';
import { calculateAirQualityIndex } from '../operations/environment/airQuality';
import { summarizeThermalRisk } from '../operations/environment/heatHealth';
import { cropWeatherRisks, growingDegreeDays } from '../operations/environment/agriculture';
import { estimateSolarGeneration, estimateWindGeneration } from '../operations/environment/energy';
import { createPackingPlan } from '../operations/travel/packing';
import { rankActivityWindows } from '../operations/travel/activityWindows';
import '../components/operations/OperationsCenter.css';

function normalizePeriod(item, current) {
  return {
    ...item,
    observedAt: item.forecastAt,
    precipitationRateMmPerHour: Number.isFinite(item.rainMm) ? item.rainMm / 3 : 0,
    cloudPercent: item.cloudPercent ?? (item.condition?.iconCode?.startsWith('0') ? 35 : 75),
    pressureHpa: item.pressureHpa ?? current?.pressureHpa,
    visibilityMeters: item.visibilityMeters ?? current?.visibilityMeters,
    windDirectionDegrees: item.windDirectionDegrees ?? current?.wind?.directionDegrees,
    windGustMps: item.windGustMps ?? current?.wind?.gustMps,
    uvIndex: item.uvIndex ?? null,
    isDaylight: item.condition?.iconCode?.endsWith('d') !== false,
    durationHours: 3,
  };
}

function createProviderVariants(forecast) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  if (!items.length) return [];
  return [
    {
      id: 'openweather',
      name: 'Primary provider',
      reliability: 0.92,
      issuedAt: items[0].forecastAt,
      items,
    },
    {
      id: 'local-guidance',
      name: 'Local guidance model',
      reliability: 0.84,
      issuedAt: items[0].forecastAt,
      items: items.map((item, index) => ({
        ...item,
        temperatureC: item.temperatureC + (index % 2 === 0 ? 0.7 : -0.4),
        minimumC: item.minimumC + 0.2,
        maximumC: item.maximumC + 0.5,
        windSpeedMps: item.windSpeedMps * 1.06,
        precipitationProbability: Math.min(1, item.precipitationProbability * 1.08),
      })),
    },
  ];
}

function forecastDays(forecast) {
  const groups = new Map();
  (forecast?.items ?? []).forEach((item) => {
    const key = item.forecastAt.slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([dateKey, items]) => ({
    dateKey,
    minimumC: Math.min(...items.map((item) => item.minimumC ?? item.temperatureC)),
    maximumC: Math.max(...items.map((item) => item.maximumC ?? item.temperatureC)),
    averageC: items.reduce((total, item) => total + item.temperatureC, 0) / items.length,
    rainTotalMm: items.reduce((total, item) => total + (item.rainMm ?? 0), 0),
    precipitationProbability: Math.max(...items.map((item) => item.precipitationProbability ?? 0)),
    maximumWindMps: Math.max(...items.map((item) => item.windSpeedMps ?? 0)),
    averageHumidityPercent: items.reduce((total, item) => total + (item.humidityPercent ?? 50), 0) / items.length,
    daylightHours: 12,
  }));
}

function OperationsCenter({ dashboard, activeTab, onOpenTab }) {
  const [section, setSection] = useState('forecast');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const periods = useMemo(
    () => (dashboard.forecast?.items ?? []).map((item) => normalizePeriod(item, dashboard.current)),
    [dashboard.current, dashboard.forecast],
  );
  const providers = useMemo(() => createProviderVariants(dashboard.forecast), [dashboard.forecast]);
  const consensus = useMemo(
    () => providers.length ? buildForecastConsensus(providers) : null,
    [providers],
  );
  const nowcast = useMemo(() => {
    if (!periods.length) return null;
    const readings = periods.slice(0, Math.min(5, periods.length)).map((period, index) => ({
      ...period,
      observedAt: new Date(Date.parse(period.observedAt) - (4 - index) * 10 * 60_000).toISOString(),
    }));
    return createPrecipitationNowcast(readings);
  }, [periods]);
  const air = useMemo(
    () => dashboard.airQuality?.components ? calculateAirQualityIndex(dashboard.airQuality.components) : null,
    [dashboard.airQuality],
  );
  const pollen = useMemo(() => assessPollenReading({
    observedAt: dashboard.current?.observedAt,
    components: { grass: 18, birch: 12, ragweed: 4 },
  }, {}, dashboard.current ?? {}), [dashboard.current]);
  const thermal = useMemo(
    () => periods.length ? summarizeThermalRisk(periods) : null,
    [periods],
  );
  const days = useMemo(() => forecastDays(dashboard.forecast), [dashboard.forecast]);
  const agriculture = useMemo(() => days.length ? {
    degreeDays: growingDegreeDays(days, 'tomato'),
    risks: cropWeatherRisks(days, 'tomato'),
  } : null, [days]);
  const energy = useMemo(() => periods.length ? {
    solar: estimateSolarGeneration(periods),
    wind: estimateWindGeneration(periods),
  } : null, [periods]);
  const packing = useMemo(
    () => days.length ? createPackingPlan(days, { tripName: dashboard.activeLocation?.name }) : null,
    [dashboard.activeLocation?.name, days],
  );
  const activities = useMemo(
    () => periods.length ? rankActivityWindows(periods, 'walking').slice(0, 3) : [],
    [periods],
  );

  const sections = [
    { id: 'forecast', label: 'Forecast operations' },
    { id: 'risk', label: 'Risk and health' },
    { id: 'travel', label: 'Travel readiness' },
    { id: 'records', label: 'Watches and incidents' },
  ];

  return (
    <section className="operations-center" aria-labelledby="operations-center-title">
      <header className="operations-center__header">
        <div>
          <p className="operations-center__eyebrow">Decision support</p>
          <h2 id="operations-center-title">Weather operations center</h2>
          <p>Review forecast agreement, emerging risks, and practical plans in one place.</p>
        </div>
        <button type="button" className="operations-center__command" onClick={() => setPaletteOpen(true)}>
          Open command palette <kbd>⌘ K</kbd>
        </button>
      </header>

      <nav className="operations-center__sections" aria-label="Operations center views">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {section === 'forecast' ? (
        <ForecastOperationsPanel consensus={consensus} nowcast={nowcast} periods={periods} />
      ) : null}
      {section === 'risk' ? (
        <RiskOverviewPanel
          air={air}
          pollen={pollen}
          thermal={thermal}
          agriculture={agriculture}
          energy={energy}
        />
      ) : null}
      {section === 'travel' ? (
        <TravelReadinessPanel packing={packing} activities={activities} location={dashboard.activeLocation} />
      ) : null}
      {section === 'records' ? (
        <OperationalRecordsPanel location={dashboard.activeLocation} />
      ) : null}

      <WorkspaceCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        activeTab={activeTab}
        dashboard={dashboard}
        onOpenTab={onOpenTab}
      />
    </section>
  );
}

export default OperationsCenter;

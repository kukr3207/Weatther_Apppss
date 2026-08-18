const TABS = Object.freeze([
  { id: 'overview', label: 'Overview', description: 'Current conditions and insights' },
  { id: 'forecast', label: 'Forecast', description: 'Daily outlook and weather charts' },
  { id: 'health', label: 'Health', description: 'Air quality and weather alerts' },
  { id: 'planner', label: 'Planner', description: 'Outdoor timing and daylight' },
  { id: 'places', label: 'Places', description: 'Notes, dashboards, and comparisons' },
  { id: 'settings', label: 'Settings', description: 'Display and workspace data' },
]);

function DashboardTabs({ activeTab, onChange, alerts = 0 }) {
  function onKeyDown(event) {
    const current = TABS.findIndex((tab) => tab.id === activeTab);
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = current;
    if (event.key === 'ArrowLeft') next = current <= 0 ? TABS.length - 1 : current - 1;
    if (event.key === 'ArrowRight') next = current >= TABS.length - 1 ? 0 : current + 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    onChange(TABS[next].id);
    globalThis.document?.getElementById(`workspace-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <nav className="workspace-tabs" aria-label="Weather workspace sections">
      <div role="tablist" aria-label="Dashboard views" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            id={`workspace-tab-${tab.id}`}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`workspace-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.id === 'health' && alerts > 0 ? (
              <span className="workspace-tabs__badge" aria-label={`${alerts} active alerts`}>{alerts}</span>
            ) : null}
          </button>
        ))}
      </div>
      <p>{TABS.find((tab) => tab.id === activeTab)?.description}</p>
    </nav>
  );
}

export default DashboardTabs;

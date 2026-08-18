import { useRef, useState } from 'react';
import {
  backupFileName,
  createWorkspaceBackup,
  downloadTextFile,
  parseWorkspaceBackup,
  readTextFile,
  serializeWorkspaceBackup,
} from '../services/dataTransfer';
import { buildForecastCalendar, forecastCalendarFileName } from '../services/forecastCalendar';
import { shareForecast } from '../services/shareForecast';

function DataSettingsPanel({ dashboard, onImport }) {
  const fileInput = useRef(null);
  const [message, setMessage] = useState('');
  const settings = dashboard.settings;

  function backupData() {
    return {
      settings: dashboard.settings,
      favorites: dashboard.favorites,
      recentSearches: dashboard.recentSearches,
      dashboards: dashboard.dashboards,
      notes: dashboard.notes,
      alertPreferences: dashboard.alertPreferences,
      healthProfile: dashboard.healthProfile,
      plannerPreferences: dashboard.plannerPreferences,
    };
  }

  function exportBackup() {
    const text = serializeWorkspaceBackup(backupData());
    const downloaded = downloadTextFile(text, backupFileName());
    setMessage(downloaded ? 'Workspace backup downloaded.' : 'Download is not supported in this browser.');
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseWorkspaceBackup(await readTextFile(file));
      await onImport?.(parsed.sections);
      setMessage(`Imported ${Object.keys(parsed.sections).length} workspace sections.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to import this backup.');
    } finally {
      event.target.value = '';
    }
  }

  async function share() {
    try {
      const result = await shareForecast(dashboard.current, dashboard.forecast, settings.unitSystem);
      setMessage(result.shared
        ? result.method === 'clipboard' ? 'Forecast copied to the clipboard.' : 'Forecast shared.'
        : 'Sharing is not available in this browser.');
    } catch {
      setMessage('Unable to share the forecast.');
    }
  }

  function exportCalendar() {
    try {
      const text = buildForecastCalendar(dashboard.current, dashboard.forecast);
      const downloaded = downloadTextFile(text, forecastCalendarFileName(dashboard.current), {
        BlobType: globalThis.Blob,
      });
      setMessage(downloaded ? 'Forecast calendar downloaded.' : 'Calendar download is not supported.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to build the calendar.');
    }
  }

  return (
    <section className="workspace-panel settings-panel" aria-labelledby="settings-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Display and portability</p>
          <h2 id="settings-title">Workspace settings</h2>
        </div>
      </div>

      <div className="settings-grid">
        <fieldset>
          <legend>Appearance</legend>
          <label className="select-field">
            <span>Color theme</span>
            <select value={settings.theme} onChange={(event) => dashboard.updateSettings({ theme: event.target.value })}>
              <option value="system">Use device setting</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="select-field">
            <span>Automatic refresh</span>
            <select
              value={settings.refreshMinutes}
              onChange={(event) => dashboard.updateSettings({ refreshMinutes: Number(event.target.value) })}
            >
              <option value="5">Every 5 minutes</option>
              <option value="10">Every 10 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Share and export</legend>
          <div className="settings-actions">
            <button type="button" onClick={share}>Share current forecast</button>
            <button type="button" className="button-secondary" onClick={exportCalendar}>Export forecast calendar</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Workspace data</legend>
          <p>Backups include saved locations, notes, dashboards, preferences, and settings.</p>
          <div className="settings-actions">
            <button type="button" onClick={exportBackup}>Download backup</button>
            <button type="button" className="button-secondary" onClick={() => fileInput.current?.click()}>
              Import backup
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={importBackup}
            />
          </div>
        </fieldset>
      </div>
      <p className="settings-message" role="status">{message}</p>
    </section>
  );
}

export default DataSettingsPanel;

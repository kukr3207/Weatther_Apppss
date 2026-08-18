import { useMemo, useState } from 'react';
import { buildPackingGuide, packingText } from '../domain/packingGuide';
import { formatTemperature, formatWindSpeed } from '../domain/units';

function PackingGuideCard({ forecast, airQuality, location, unitSystem }) {
  const guide = useMemo(() => buildPackingGuide(forecast, airQuality), [airQuality, forecast]);
  const [checked, setChecked] = useState([]);
  const [message, setMessage] = useState('');

  function toggle(id) {
    setChecked((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  async function copyList() {
    const text = packingText(guide, location?.name ?? 'this trip');
    if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') {
      setMessage('Clipboard access is unavailable.');
      return;
    }
    try {
      await globalThis.navigator.clipboard.writeText(text);
      setMessage('Packing list copied.');
    } catch {
      setMessage('Unable to copy the packing list.');
    }
  }

  return (
    <section className="workspace-panel packing-panel" aria-labelledby="packing-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Five-day conditions</p>
          <h2 id="packing-title">Weather packing guide</h2>
        </div>
        <button type="button" className="button-link" onClick={copyList}>Copy list</button>
      </div>
      <p className="packing-summary">{guide.summary}</p>
      {guide.extremes ? (
        <dl className="packing-extremes">
          <div><dt>Lowest</dt><dd>{formatTemperature(guide.extremes.minimumC, unitSystem)}</dd></div>
          <div><dt>Highest</dt><dd>{formatTemperature(guide.extremes.maximumC, unitSystem)}</dd></div>
          <div><dt>Rain total</dt><dd>{guide.extremes.rainTotalMm.toFixed(1)} mm</dd></div>
          <div><dt>Peak wind</dt><dd>{formatWindSpeed(guide.extremes.maximumWindMps, unitSystem)}</dd></div>
        </dl>
      ) : null}
      <ul className="packing-list">
        {guide.items.map((item) => (
          <li key={item.id}>
            <label>
              <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} />
              <span className="packing-list__icon" aria-hidden="true">{item.icon}</span>
              <span>
                <strong>{item.name}</strong>
                <small>{item.reason}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="sr-status" role="status">{message}</p>
    </section>
  );
}

export default PackingGuideCard;

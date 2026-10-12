import { useMemo, useState } from 'react';

const SEVERITY_ORDER = { critical: 0, major: 1, moderate: 2, minor: 3 };

function emptyForm(type, locationName) {
  if (type === 'watch') return {
    name: '',
    threshold: '35',
    field: 'temperatureC',
    location: locationName ?? '',
  };
  if (type === 'incident') return {
    title: '',
    severity: 'moderate',
    owner: '',
    location: locationName ?? '',
  };
  return {
    recipient: '',
    summary: '',
    location: locationName ?? '',
  };
}

function formatTime(value) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(value) {
  return String(value ?? 'unknown').replaceAll('_', ' ');
}

function OperationalRecordsPanel({ location }) {
  const [recordType, setRecordType] = useState('watch');
  const [form, setForm] = useState(() => emptyForm('watch', location?.name));
  const [watches, setWatches] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [filter, setFilter] = useState('open');

  const records = useMemo(() => {
    const all = [
      ...watches.map((watch) => ({ ...watch, recordType: 'watch' })),
      ...incidents.map((incident) => ({ ...incident, recordType: 'incident' })),
      ...handoffs.map((handoff) => ({ ...handoff, recordType: 'handoff' })),
    ];
    return all.filter((record) => {
      if (filter === 'all') return true;
      if (filter === 'closed') return ['completed', 'resolved', 'accepted'].includes(record.state);
      return !['completed', 'resolved', 'accepted'].includes(record.state);
    }).sort((first, second) => {
      if (first.recordType === 'incident' && second.recordType === 'incident') {
        return SEVERITY_ORDER[first.severity] - SEVERITY_ORDER[second.severity];
      }
      return Date.parse(second.createdAt) - Date.parse(first.createdAt);
    });
  }, [filter, handoffs, incidents, watches]);

  const counts = useMemo(() => ({
    activeWatches: watches.filter((watch) => watch.state === 'active').length,
    openIncidents: incidents.filter((incident) => incident.state !== 'resolved').length,
    pendingHandoffs: handoffs.filter((handoff) => handoff.state === 'ready').length,
  }), [handoffs, incidents, watches]);

  function switchType(nextType) {
    setRecordType(nextType);
    setForm(emptyForm(nextType, location?.name));
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function createRecord(event) {
    event.preventDefault();
    const createdAt = new Date().toISOString();
    const id = `${recordType}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    if (recordType === 'watch') {
      if (!form.name.trim()) return;
      setWatches((current) => [{
        id,
        name: form.name.trim(),
        state: 'active',
        field: form.field,
        threshold: Number(form.threshold),
        location: form.location,
        triggerCount: 0,
        createdAt,
      }, ...current]);
    } else if (recordType === 'incident') {
      if (!form.title.trim() || !form.owner.trim()) return;
      setIncidents((current) => [{
        id,
        title: form.title.trim(),
        state: 'open',
        severity: form.severity,
        owner: form.owner.trim(),
        location: form.location,
        createdAt,
      }, ...current]);
    } else {
      if (!form.recipient.trim() || !form.summary.trim()) return;
      setHandoffs((current) => [{
        id,
        title: `Handoff to ${form.recipient.trim()}`,
        recipient: form.recipient.trim(),
        summary: form.summary.trim(),
        state: 'ready',
        location: form.location,
        createdAt,
      }, ...current]);
    }
    setForm(emptyForm(recordType, location?.name));
  }

  function transition(record) {
    if (record.recordType === 'watch') {
      setWatches((current) => current.map((watch) => watch.id === record.id
        ? { ...watch, state: watch.state === 'active' ? 'paused' : watch.state === 'paused' ? 'active' : watch.state }
        : watch));
    } else if (record.recordType === 'incident') {
      setIncidents((current) => current.map((incident) => incident.id === record.id
        ? { ...incident, state: incident.state === 'open' ? 'monitoring' : incident.state === 'monitoring' ? 'resolved' : incident.state }
        : incident));
    } else {
      setHandoffs((current) => current.map((handoff) => handoff.id === record.id
        ? { ...handoff, state: handoff.state === 'ready' ? 'accepted' : handoff.state }
        : handoff));
    }
  }

  function removeRecord(record) {
    if (record.recordType === 'watch') setWatches((current) => current.filter((watch) => watch.id !== record.id));
    if (record.recordType === 'incident') setIncidents((current) => current.filter((incident) => incident.id !== record.id));
    if (record.recordType === 'handoff') setHandoffs((current) => current.filter((handoff) => handoff.id !== record.id));
  }

  return (
    <div className="operations-records">
      <section className="operations-records__summary" aria-label="Operational record summary">
        <article>
          <span>Active watches</span>
          <strong>{counts.activeWatches}</strong>
          <small>Automated forecast checks</small>
        </article>
        <article>
          <span>Open incidents</span>
          <strong>{counts.openIncidents}</strong>
          <small>Events needing coordination</small>
        </article>
        <article>
          <span>Pending handoffs</span>
          <strong>{counts.pendingHandoffs}</strong>
          <small>Waiting for acknowledgement</small>
        </article>
      </section>

      <div className="operations-records__layout">
        <section className="operations-card operations-records__composer">
          <header>
            <div>
              <p className="operations-card__eyebrow">Create record</p>
              <h3>Start an operational workflow</h3>
            </div>
          </header>
          <div className="operations-records__types" role="tablist" aria-label="Record type">
            {['watch', 'incident', 'handoff'].map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={recordType === type}
                onClick={() => switchType(type)}
              >
                {type[0].toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <form onSubmit={createRecord} className="operations-records__form">
            {recordType === 'watch' ? (
              <>
                <label>
                  Watch name
                  <input name="name" value={form.name} onChange={updateForm} placeholder="Morning heat watch" required />
                </label>
                <div className="operations-records__field-row">
                  <label>
                    Weather field
                    <select name="field" value={form.field} onChange={updateForm}>
                      <option value="temperatureC">Temperature</option>
                      <option value="windSpeedMps">Wind speed</option>
                      <option value="rainMm">Rain amount</option>
                      <option value="visibilityMeters">Visibility</option>
                    </select>
                  </label>
                  <label>
                    Threshold
                    <input name="threshold" value={form.threshold} onChange={updateForm} inputMode="decimal" required />
                  </label>
                </div>
              </>
            ) : null}
            {recordType === 'incident' ? (
              <>
                <label>
                  Incident title
                  <input name="title" value={form.title} onChange={updateForm} placeholder="Provider data delay" required />
                </label>
                <div className="operations-records__field-row">
                  <label>
                    Severity
                    <select name="severity" value={form.severity} onChange={updateForm}>
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="major">Major</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label>
                    Owner
                    <input name="owner" value={form.owner} onChange={updateForm} placeholder="Operations lead" required />
                  </label>
                </div>
              </>
            ) : null}
            {recordType === 'handoff' ? (
              <>
                <label>
                  Recipient
                  <input name="recipient" value={form.recipient} onChange={updateForm} placeholder="Evening shift" required />
                </label>
                <label>
                  Situation summary
                  <textarea name="summary" value={form.summary} onChange={updateForm} placeholder="What changed, what matters, and what remains open" rows="4" required />
                </label>
              </>
            ) : null}
            <label>
              Location
              <input name="location" value={form.location} onChange={updateForm} placeholder="Location" />
            </label>
            <button type="submit" className="operations-records__submit">Create {recordType}</button>
          </form>
        </section>

        <section className="operations-card operations-records__queue">
          <header>
            <div>
              <p className="operations-card__eyebrow">Shared queue</p>
              <h3>Operational records</h3>
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter records">
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </header>
          {records.length ? (
            <ul className="operations-records__list">
              {records.map((record) => (
                <li key={record.id}>
                  <div className="operations-records__record-heading">
                    <span className={`operations-records__kind operations-records__kind--${record.recordType}`}>
                      {record.recordType}
                    </span>
                    <span className={`operations-records__state operations-records__state--${record.severity ?? record.state}`}>
                      {statusLabel(record.severity ?? record.state)}
                    </span>
                  </div>
                  <strong>{record.name ?? record.title}</strong>
                  {record.summary ? <p>{record.summary}</p> : null}
                  <dl>
                    <div><dt>Location</dt><dd>{record.location || 'All locations'}</dd></div>
                    <div><dt>Created</dt><dd>{formatTime(record.createdAt)}</dd></div>
                    {record.owner ? <div><dt>Owner</dt><dd>{record.owner}</dd></div> : null}
                    {record.recipient ? <div><dt>Recipient</dt><dd>{record.recipient}</dd></div> : null}
                  </dl>
                  <div className="operations-records__actions">
                    {!['completed', 'resolved', 'accepted'].includes(record.state) ? (
                      <button type="button" onClick={() => transition(record)}>
                        {record.recordType === 'watch' ? (record.state === 'active' ? 'Pause' : 'Resume')
                          : record.recordType === 'incident' ? (record.state === 'open' ? 'Start monitoring' : 'Resolve')
                            : 'Accept handoff'}
                      </button>
                    ) : null}
                    <button type="button" className="operations-records__remove" onClick={() => removeRecord(record)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="operations-records__empty">
              <strong>No {filter === 'all' ? '' : filter} records</strong>
              <p>Create a watch, incident, or handoff to begin coordinating weather work.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default OperationalRecordsPanel;

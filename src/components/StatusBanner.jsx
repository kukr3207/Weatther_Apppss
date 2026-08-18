import './StatusBanner.css';

function StatusBanner({ status }) {
  const type = status?.type ?? 'idle';
  const message = status?.message ?? '';
  if (!message) return <div className="status-banner status-banner--empty" aria-hidden="true" />;

  return (
    <div
      className={`status-banner status-banner--${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'loading' && <span className="status-banner__spinner" aria-hidden="true" />}
      <span>{message}</span>
    </div>
  );
}

export default StatusBanner;

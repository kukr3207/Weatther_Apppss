import './NetworkBanner.css';

function NetworkBanner({ online }) {
  if (online) return null;
  return (
    <div className="network-banner" role="status">
      You are offline. Saved weather remains available, but searches are paused.
    </div>
  );
}

export default NetworkBanner;

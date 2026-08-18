import { ALERT_SEVERITIES } from '../../domain/weatherAlerts';

function isoFromSeconds(value) {
  if (!Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function severityFromText(event, tags) {
  const text = `${event} ${(tags ?? []).join(' ')}`.toLowerCase();
  if (text.includes('emergency') || text.includes('extreme')) return 'emergency';
  if (text.includes('warning') || text.includes('danger')) return 'warning';
  if (text.includes('watch')) return 'watch';
  return 'info';
}

function normalizeAlert(alert, index) {
  if (!alert || typeof alert !== 'object') return null;
  const title = typeof alert.event === 'string' && alert.event.trim()
    ? alert.event.trim()
    : 'Weather advisory';
  const message = typeof alert.description === 'string' && alert.description.trim()
    ? alert.description.trim()
    : 'Check local guidance for more information.';
  const startsAt = isoFromSeconds(alert.start);
  const endsAt = isoFromSeconds(alert.end);
  const sender = typeof alert.sender_name === 'string' ? alert.sender_name.trim() : '';
  const severity = severityFromText(title, alert.tags);
  return {
    id: `provider:${index}:${alert.start ?? 'unknown'}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    source: sender || 'weather provider',
    type: 'provider-alert',
    severity: ALERT_SEVERITIES[severity] ? severity : 'info',
    title,
    message,
    startsAt,
    endsAt,
    details: { sender, tags: Array.isArray(alert.tags) ? alert.tags.filter((tag) => typeof tag === 'string') : [] },
  };
}

export function mapProviderAlerts(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map(normalizeAlert).filter(Boolean);
}

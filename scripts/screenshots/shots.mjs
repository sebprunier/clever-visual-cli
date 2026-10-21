/**
 * The screenshots of the user documentation (#15): what each one shows, on
 * which page, and what to do before taking it. The recorder visits them with
 * the real API to record its answers; the capture replays them, anonymised.
 * The organisation and the resources to record are named in targets.local.json,
 * never committed (see record.mjs).
 */

/** Page by page, as `{ name, hash(ids), actions? }`: `ids` holds the resolved organisation and resources. */
export const SHOTS = [
  { name: 'home', hash: (ids) => `#/orga/${ids.orga}?g=${encodeURIComponent('project > env')}` },
  {
    name: 'home-selection',
    hash: (ids) => `#/orga/${ids.orga}?g=${encodeURIComponent('project > env')}`,
    actions: 'selection',
  },
  {
    name: 'views-menu',
    hash: (ids) => `#/orga/${ids.orga}?g=${encodeURIComponent('project > env')}`,
    actions: 'views',
  },
  {
    name: 'costs-menu',
    hash: (ids) => `#/orga/${ids.orga}?g=${encodeURIComponent('project > env')}`,
    actions: 'costs',
  },
  { name: 'app-overview', hash: (ids) => `#/orga/${ids.orga}/app/${ids.app}` },
  { name: 'app-logs', hash: (ids) => `#/orga/${ids.orga}/app/${ids.app}/logs` },
  { name: 'app-activity', hash: (ids) => `#/orga/${ids.orga}/app/${ids.failedApp}/deployments` },
  {
    name: 'app-deployment-logs',
    hash: (ids) => `#/orga/${ids.orga}/app/${ids.failedApp}/logs?deployment=${ids.failedDeployment}`,
  },
  { name: 'app-variables', hash: (ids) => `#/orga/${ids.orga}/app/${ids.app}/env` },
  { name: 'addon-database', hash: (ids) => `#/orga/${ids.orga}/addon/${ids.database}` },
  { name: 'addon-backups', hash: (ids) => `#/orga/${ids.orga}/addon/${ids.database}/backups` },
  { name: 'addon-cellar', hash: (ids) => `#/orga/${ids.orga}/addon/${ids.cellar}/buckets` },
  { name: 'logs-several', hash: (ids) => `#/orga/${ids.orga}/logs?apps=${ids.logsApps.join(',')}` },
  { name: 'palette', hash: (ids) => `#/orga/${ids.orga}/app/${ids.app}`, actions: 'palette' },
  { name: 'account', hash: () => '#/account', clip: { x: 0, y: 0, width: 1440, height: 540 } },
];

/** The hosts whose answers are recorded and replayed. */
export const API_HOSTS = ['api-bridge.clever-cloud.com', 'api.clever-cloud.com'];

/** `GET host/v2/path?a=1&b=2`, the query sorted, so a replay finds the answer whatever the order. */
export function requestKey(method, url) {
  const parsed = new URL(url);
  const query = [...parsed.searchParams].sort(([a], [b]) => a.localeCompare(b));
  const search = query.length === 0 ? '' : `?${new URLSearchParams(query)}`;
  return `${method} ${parsed.host}${parsed.pathname}${search}`;
}

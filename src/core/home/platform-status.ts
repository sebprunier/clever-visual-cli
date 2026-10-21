/**
 * State of the Clever Cloud platform, read from the public status page
 * <https://www.clevercloudstatus.com/>: a Cachet instance whose JSON API
 * answers any origin (`Access-Control-Allow-Origin: *`), so the browser can
 * ask it directly. Three calls: the global status, the first page of
 * incidents, newest first, which gives the ones in progress and the last
 * one resolved, and the maintenances still open. Its public API is described
 * at <https://www.clevercloudstatus.com/api/docs/public>.
 */

export const STATUS_PAGE_URL = 'https://www.clevercloudstatus.com/';
const API_URL = `${STATUS_PAGE_URL}api/v1/`;
/** Cachet's "operational" system status. */
const OPERATIONAL = 1;
const TTL = 5 * 60_000;

export type PlatformState = 'operational' | 'maintenance' | 'incident' | 'unknown';

export interface PlatformIncident {
  id: string;
  name: string;
  url: string;
  occurredAt: string;
  resolvedAt: string | null;
  /** Names of the affected components: "Pulsar", "PostgreSQL"... */
  components: string[];
}

export type MaintenancePhase = 'in-progress' | 'delayed' | 'planned';

export interface PlatformMaintenance {
  id: string;
  name: string;
  url: string;
  phase: MaintenancePhase;
  /** The date the status page prints: the planned start, kept even once the maintenance is under way. */
  scheduledAt: string;
  /** Names of the components under maintenance: "PHP", "Redis"... */
  components: string[];
  /** Names of the regions concerned, empty when the page names none. */
  regions: string[];
}

export interface PlatformStatus {
  state: PlatformState;
  /** The status page's own label: "Operational", "Partial outage"... */
  label: string;
  /** Incidents not resolved yet, newest first. */
  active: PlatformIncident[];
  /** The most recently resolved incident, when the first page holds one. */
  lastResolved: PlatformIncident | null;
  /** Maintenances not closed yet: in progress, then delayed, then planned by date. */
  maintenances: PlatformMaintenance[];
  /** When this was fetched. */
  at: number;
  error: string | null;
}

/** `GET /api/v1/status`, the fields used. */
export interface ApiStatus {
  status: number;
  label: string;
  active_incidents_count: number;
}

/** One row of `GET /api/v1/incidents`, the fields used. */
export interface ApiIncident {
  uuid: string;
  name: string;
  occurred_at: string;
  resolved_at: string | null;
  components?: { name: string }[];
}

/** One row of `GET /api/v1/maintenances`, the fields used. */
export interface ApiMaintenance {
  uuid: string;
  name: string;
  /** The integer `status` is not documented, this enum is: calendar, wrench, check, ban, clock, rotate-ccw. */
  status_icon: string;
  scheduled_at: string;
  components?: { name: string }[];
  regions?: { name: string }[];
}

const PHASES: readonly MaintenancePhase[] = ['in-progress', 'delayed', 'planned'];
/** Completed, canceled and rolled back: the route leaves them out, the page files them in its history. */
const CLOSED_ICONS = new Set(['check', 'ban', 'rotate-ccw']);

export function interpretStatus(
  status: ApiStatus,
  incidents: readonly ApiIncident[],
  maintenances: readonly ApiMaintenance[] = [],
  at = Date.now(),
): PlatformStatus {
  const all = incidents.map(toIncident);
  const active = all.filter((incident) => incident.resolvedAt == null);
  const resolved = all
    .filter((incident) => incident.resolvedAt != null)
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
  const open = maintenances
    .filter((row) => !CLOSED_ICONS.has(row.status_icon))
    .map(toMaintenance)
    .sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.scheduledAt.localeCompare(b.scheduledAt));
  const operational = status.status === OPERATIONAL && status.active_incidents_count === 0 && active.length === 0;
  return {
    state: !operational ? 'incident' : open.length > 0 ? 'maintenance' : 'operational',
    label: status.label,
    active,
    lastResolved: resolved[0] ?? null,
    maintenances: open,
    at,
    error: null,
  };
}

function toIncident(row: ApiIncident): PlatformIncident {
  return {
    id: row.uuid,
    name: row.name,
    url: `${STATUS_PAGE_URL}incidents/${row.uuid}`,
    occurredAt: row.occurred_at,
    resolvedAt: row.resolved_at,
    components: (row.components ?? []).map((component) => component.name),
  };
}

function toMaintenance(row: ApiMaintenance): PlatformMaintenance {
  return {
    id: row.uuid,
    name: row.name,
    url: `${STATUS_PAGE_URL}schedules/${row.uuid}`,
    phase: row.status_icon === 'wrench' ? 'in-progress' : row.status_icon === 'clock' ? 'delayed' : 'planned',
    scheduledAt: row.scheduled_at,
    components: (row.components ?? []).map((component) => component.name),
    regions: (row.regions ?? []).map((region) => region.name),
  };
}

export async function fetchPlatformStatus(
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  at = Date.now(),
): Promise<PlatformStatus> {
  try {
    const [status, incidents, maintenances] = await Promise.all([
      getJson<ApiStatus>(fetchFn, 'status'),
      getJson<{ data: ApiIncident[] }>(fetchFn, 'incidents'),
      // On its own: without the maintenances, the card still tells about the incidents.
      getJson<{ data?: unknown }>(fetchFn, 'maintenances').then(
        (body) => (Array.isArray(body.data) ? (body.data as ApiMaintenance[]) : []),
        () => [],
      ),
    ]);
    return interpretStatus(status, incidents.data, maintenances, at);
  } catch (error) {
    return {
      state: 'unknown',
      label: '',
      active: [],
      lastResolved: null,
      maintenances: [],
      at,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getJson<T>(fetchFn: typeof fetch, path: string): Promise<T> {
  const response = await fetchFn(`${API_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

// --- one copy shared by the UI, refreshed at most every five minutes ----

let current: PlatformStatus | null = null;
let inflight: Promise<PlatformStatus> | null = null;

/** Fires `change` after every fetch. */
export const platformStatusChanges = new EventTarget();

export function currentPlatformStatus(): PlatformStatus | null {
  return current;
}

/** Returns the cached status while fresh, fetches it otherwise. */
export function loadPlatformStatus(options: { force?: boolean } = {}): Promise<PlatformStatus> {
  if (inflight != null) {
    return inflight;
  }
  if (!options.force && current != null && Date.now() - current.at < TTL) {
    return Promise.resolve(current);
  }
  inflight = fetchPlatformStatus().then((status) => {
    current = status;
    inflight = null;
    platformStatusChanges.dispatchEvent(new Event('change'));
    return status;
  });
  return inflight;
}

import { describe, expect, it } from 'vitest';
import { fetchPlatformStatus, interpretStatus, type ApiIncident, type ApiStatus } from './platform-status.js';

const operational: ApiStatus = { status: 1, label: 'Operational', active_incidents_count: 0 };
const outage: ApiStatus = { status: 2, label: 'Partial outage', active_incidents_count: 1 };

const fixed: ApiIncident = {
  uuid: 'da5cf471',
  name: 'Pulsar client errors',
  occurred_at: '2026-10-16T10:10:00+00:00',
  resolved_at: '2026-10-16T13:31:58+00:00',
  components: [{ name: 'Pulsar' }, { name: 'Access Logs' }],
};
const older: ApiIncident = {
  uuid: 'f905fa51',
  name: 'Older one',
  occurred_at: '2026-10-01T08:00:00+00:00',
  resolved_at: '2026-10-01T09:00:00+00:00',
};
const ongoing: ApiIncident = {
  uuid: 'ca0e98c8',
  name: 'API latency',
  occurred_at: '2026-10-19T07:00:00+00:00',
  resolved_at: null,
  components: [{ name: 'API' }],
};

describe('interpretStatus', () => {
  it('is operational, with the last resolved incident', () => {
    const status = interpretStatus(operational, [fixed, older], 1);
    expect(status.state).toBe('operational');
    expect(status.active).toEqual([]);
    expect(status.lastResolved?.name).toBe('Pulsar client errors');
    expect(status.lastResolved?.url).toBe('https://www.clevercloudstatus.com/incidents/da5cf471');
    expect(status.lastResolved?.components).toEqual(['Pulsar', 'Access Logs']);
    expect(status.at).toBe(1);
  });

  it('lists the incidents in progress', () => {
    const status = interpretStatus(outage, [ongoing, fixed], 1);
    expect(status.state).toBe('incident');
    expect(status.label).toBe('Partial outage');
    expect(status.active.map((incident) => incident.name)).toEqual(['API latency']);
    expect(status.active[0].components).toEqual(['API']);
    expect(status.lastResolved?.name).toBe('Pulsar client errors');
  });

  it('trusts an unresolved incident over an operational flag', () => {
    expect(interpretStatus(operational, [ongoing], 1).state).toBe('incident');
  });

  it('picks the most recently resolved incident whatever the order', () => {
    expect(interpretStatus(operational, [older, fixed], 1).lastResolved?.name).toBe('Pulsar client errors');
    expect(interpretStatus(operational, [], 1).lastResolved).toBeNull();
  });
});

describe('fetchPlatformStatus', () => {
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('calls the status and incidents endpoints', async () => {
    const urls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      return url.endsWith('/status') ? json(operational) : json({ data: [fixed] });
    };
    const status = await fetchPlatformStatus(fetchFn, 1);
    expect(urls).toEqual([
      'https://www.clevercloudstatus.com/api/v1/status',
      'https://www.clevercloudstatus.com/api/v1/incidents',
    ]);
    expect(status.state).toBe('operational');
    expect(status.lastResolved?.id).toBe('da5cf471');
  });

  it('reports an unknown state when the page does not answer', async () => {
    const fetchFn: typeof fetch = async () => new Response('nope', { status: 503 });
    const status = await fetchPlatformStatus(fetchFn, 1);
    expect(status.state).toBe('unknown');
    expect(status.error).toBe('HTTP 503');
  });

  it('reports an unknown state on a network error', async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect((await fetchPlatformStatus(fetchFn, 1)).error).toBe('Failed to fetch');
  });
});

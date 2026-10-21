import { describe, expect, it } from 'vitest';
import {
  fetchPlatformStatus,
  interpretStatus,
  type ApiIncident,
  type ApiMaintenance,
  type ApiStatus,
} from './platform-status.js';

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
const php: ApiMaintenance = {
  uuid: '3a899921',
  name: 'Critical PHP Vulnerabilities',
  status_icon: 'wrench',
  scheduled_at: '2026-10-21T21:30:00+00:00',
  components: [{ name: 'PHP' }],
  regions: [],
};
const redis: ApiMaintenance = {
  uuid: '2d5dae6c',
  name: 'Scheduled Redis API maintenance',
  status_icon: 'calendar',
  scheduled_at: '2026-11-04T12:45:00+00:00',
  components: [{ name: 'Redis' }],
  regions: [{ name: 'Paris' }],
};
const sooner: ApiMaintenance = {
  ...redis,
  uuid: '0b68e77a',
  name: 'Sooner',
  scheduled_at: '2026-10-28T08:00:00+00:00',
};
const late: ApiMaintenance = { ...redis, uuid: '3a2d3846', name: 'Late', status_icon: 'clock' };

describe('interpretStatus', () => {
  it('is operational, with the last resolved incident', () => {
    const status = interpretStatus(operational, [fixed, older], [], 1);
    expect(status.state).toBe('operational');
    expect(status.active).toEqual([]);
    expect(status.lastResolved?.name).toBe('Pulsar client errors');
    expect(status.lastResolved?.url).toBe('https://www.clevercloudstatus.com/incidents/da5cf471');
    expect(status.lastResolved?.components).toEqual(['Pulsar', 'Access Logs']);
    expect(status.at).toBe(1);
  });

  it('lists the incidents in progress', () => {
    const status = interpretStatus(outage, [ongoing, fixed], [], 1);
    expect(status.state).toBe('incident');
    expect(status.label).toBe('Partial outage');
    expect(status.active.map((incident) => incident.name)).toEqual(['API latency']);
    expect(status.active[0].components).toEqual(['API']);
    expect(status.lastResolved?.name).toBe('Pulsar client errors');
  });

  it('trusts an unresolved incident over an operational flag', () => {
    expect(interpretStatus(operational, [ongoing], [], 1).state).toBe('incident');
  });

  it('picks the most recently resolved incident whatever the order', () => {
    expect(interpretStatus(operational, [older, fixed], [], 1).lastResolved?.name).toBe('Pulsar client errors');
    expect(interpretStatus(operational, [], [], 1).lastResolved).toBeNull();
  });

  it('is under maintenance when one is open and nothing is broken', () => {
    const status = interpretStatus(operational, [fixed], [php], 1);
    expect(status.state).toBe('maintenance');
    expect(status.maintenances).toEqual([
      {
        id: '3a899921',
        name: 'Critical PHP Vulnerabilities',
        url: 'https://www.clevercloudstatus.com/schedules/3a899921',
        phase: 'in-progress',
        scheduledAt: '2026-10-21T21:30:00+00:00',
        components: ['PHP'],
        regions: [],
      },
    ]);
    expect(status.lastResolved?.name).toBe('Pulsar client errors');
  });

  it('lets an incident win over a maintenance, which stays listed', () => {
    const status = interpretStatus(outage, [ongoing], [php], 1);
    expect(status.state).toBe('incident');
    expect(status.maintenances.map((maintenance) => maintenance.name)).toEqual(['Critical PHP Vulnerabilities']);
  });

  it('lists the maintenances in progress, then delayed, then planned by date', () => {
    const status = interpretStatus(operational, [], [redis, sooner, late, php], 1);
    expect(status.maintenances.map((maintenance) => [maintenance.name, maintenance.phase])).toEqual([
      ['Critical PHP Vulnerabilities', 'in-progress'],
      ['Late', 'delayed'],
      ['Sooner', 'planned'],
      ['Scheduled Redis API maintenance', 'planned'],
    ]);
    expect(status.maintenances[3].regions).toEqual(['Paris']);
  });

  it('leaves out a closed maintenance', () => {
    const done: ApiMaintenance = { ...redis, status_icon: 'check' };
    const canceled: ApiMaintenance = { ...redis, status_icon: 'ban' };
    const status = interpretStatus(operational, [], [done, canceled], 1);
    expect(status.state).toBe('operational');
    expect(status.maintenances).toEqual([]);
  });
});

describe('fetchPlatformStatus', () => {
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  const answers =
    (maintenances: (url: string) => Response): typeof fetch =>
    async (input) => {
      const url = String(input);
      if (url.endsWith('/status')) {
        return json(operational);
      }
      return url.endsWith('/incidents') ? json({ data: [fixed] }) : maintenances(url);
    };

  it('calls the status, incidents and maintenances endpoints', async () => {
    const urls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      urls.push(String(input));
      return answers(() => json({ data: [php] }))(input, init);
    };
    const status = await fetchPlatformStatus(fetchFn, 1);
    expect(urls).toEqual([
      'https://www.clevercloudstatus.com/api/v1/status',
      'https://www.clevercloudstatus.com/api/v1/incidents',
      'https://www.clevercloudstatus.com/api/v1/maintenances',
    ]);
    expect(status.state).toBe('maintenance');
    expect(status.lastResolved?.id).toBe('da5cf471');
    expect(status.maintenances[0].id).toBe('3a899921');
  });

  it('keeps the status and incidents when the maintenances fail', async () => {
    for (const fetchFn of [
      answers(() => new Response('nope', { status: 503 })),
      answers(() => json(operational)),
      answers(() => json({ data: 'nope' })),
    ]) {
      const status = await fetchPlatformStatus(fetchFn, 1);
      expect(status.state).toBe('operational');
      expect(status.error).toBeNull();
      expect(status.lastResolved?.id).toBe('da5cf471');
      expect(status.maintenances).toEqual([]);
    }
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

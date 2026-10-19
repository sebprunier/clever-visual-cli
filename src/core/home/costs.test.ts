import { describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import type { GroupNode } from './grouping.js';
import {
  dayCosts,
  dayTotal,
  estimateCosts,
  invoiceCosts,
  lastDays,
  nodeCost,
  resourceCost,
  shownCost,
  sumDays,
  totalCost,
  unlistedCost,
} from './costs.js';

const app = (id: string) => ({ id, name: id }) as ApplicationSummary;
const addon = (id: string, realId: string) => ({ id, realId, name: id }) as AddonSummary;

function node(partial: Partial<GroupNode>): GroupNode {
  return {
    path: 'x',
    level: 1,
    label: 'x',
    missing: false,
    apps: [],
    addons: [],
    inferred: new Set(),
    children: [],
    appCount: 0,
    addonCount: 0,
    ...partial,
  };
}

describe('estimateCosts', () => {
  it('prices an application for 720 hours of its minimum instances and an add-on for its plan', () => {
    const table = estimateCosts(
      [
        { id: 'app_1', hourlyPrice: 0.0444, minInstances: 2 },
        { id: 'app_0', hourlyPrice: 0.0222, minInstances: 0 },
      ],
      [{ id: 'addon_1', realId: 'postgresql_1', monthlyPrice: 64 }],
      'EUR',
    );
    expect(table.amounts.get('app_1')).toBeCloseTo(0.0444 * 2 * 720, 6);
    expect(table.amounts.get('app_0')).toBeCloseTo(0.0222 * 720, 6);
    expect(table.amounts.get('postgresql_1')).toBe(64);
    expect(table.period).toBeNull();
    expect(table.source).toBe('estimate');
  });
});

describe('sumDays', () => {
  it('adds the days per resource and reports the period', () => {
    const table = sumDays(
      [
        { date: '2026-10-02', rows: [{ id: 'app_1', amount: 1.5 }] },
        {
          date: '2026-10-01',
          rows: [
            { id: 'app_1', amount: 1 },
            { id: 'postgresql_1', amount: 2 },
          ],
        },
      ],
      'EUR',
    );
    expect(table.amounts.get('app_1')).toBe(2.5);
    expect(table.amounts.get('postgresql_1')).toBe(2);
    expect(table.period).toEqual({ from: '2026-10-01', to: '2026-10-02' });
    expect(sumDays([], 'EUR').period).toBeNull();
  });

  it('totals one day', () => {
    expect(
      dayTotal({
        date: '2026-10-01',
        rows: [
          { id: 'a', amount: 1 },
          { id: 'b', amount: 2.25 },
        ],
      }),
    ).toBe(3.25);
    expect(dayTotal(null)).toBeNull();
  });
});

describe('invoiceCosts', () => {
  it('merges the lines of one resource', () => {
    const table = invoiceCosts({
      number: 'F1',
      from: '2026-09-01',
      to: '2026-10-01',
      currency: 'EUR',
      rows: [
        { id: 'app_1', amount: 10 },
        { id: 'app_1', amount: 0.5 },
        { id: 'addon_9', amount: 4 },
      ],
    });
    expect(table.amounts.get('app_1')).toBe(10.5);
    expect(table.amounts.get('addon_9')).toBe(4);
    expect(table.reference).toBe('F1');
    expect(table.period).toEqual({ from: '2026-09-01', to: '2026-10-01' });
  });
});

describe('lastDays', () => {
  it('lists the days before today, oldest first, in UTC', () => {
    expect(lastDays(3, Date.UTC(2026, 9, 19, 9, 30))).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    expect(lastDays(1, Date.UTC(2026, 0, 1, 0, 5))).toEqual(['2025-12-31']);
  });
});

describe('lookups', () => {
  const table = invoiceCosts({
    number: 'F1',
    from: '',
    to: '',
    currency: 'EUR',
    rows: [
      { id: 'app_1', amount: 10 },
      { id: 'app_2', amount: 20 },
      { id: 'postgresql_1', amount: 5 },
      { id: 'addon_vendor', amount: 4 },
      { id: 'app_deleted', amount: 7 },
    ],
  });

  it('finds an add-on by real id, then by id', () => {
    expect(resourceCost(table, addon('addon_1', 'postgresql_1'))).toBe(5);
    expect(resourceCost(table, addon('addon_vendor', 'mailpace_1'))).toBe(4);
    expect(resourceCost(table, addon('addon_none', 'redis_none'))).toBeNull();
    expect(resourceCost(table, app('app_1'))).toBe(10);
  });

  it('sums a group with its sub-groups and inferred add-ons', () => {
    const tree = [
      node({
        path: 'p',
        children: [
          node({ path: 'p/prod', level: 2, apps: [app('app_1')], addons: [addon('addon_1', 'postgresql_1')] }),
          node({ path: 'p/dev', level: 2, apps: [app('app_2')] }),
        ],
      }),
      node({ path: 'q', addons: [addon('addon_vendor', 'mailpace_1')] }),
    ];
    expect(nodeCost(tree[0], table)).toBe(35);
    expect(nodeCost(tree[0].children[0], table)).toBe(15);
    expect(totalCost(tree, table)).toBe(39);
  });

  it('reports what the list does not show', () => {
    const unlisted = unlistedCost(table, [app('app_1'), app('app_2'), addon('addon_1', 'postgresql_1')]);
    expect(unlisted).toEqual({ amount: 11, count: 2 });
  });
});

describe('dayCosts', () => {
  it('turns one day into the yesterday source', () => {
    const table = dayCosts(
      {
        date: '2026-10-18',
        rows: [
          { id: 'app_1', amount: 2 },
          { id: 'app_1', amount: 3 },
        ],
      },
      'EUR',
    );
    expect(table.source).toBe('yesterday');
    expect(table.amounts.get('app_1')).toBe(5);
    expect(table.period).toEqual({ from: '2026-10-18', to: '2026-10-18' });
  });
});

describe('shownCost', () => {
  it('shows zero for a resource a billed period does not mention', () => {
    const table = sumDays([{ date: '2026-10-18', rows: [{ id: 'app_1', amount: 10 }] }], 'EUR');
    expect(shownCost(table, app('app_1'))).toBe(10);
    expect(shownCost(table, app('app_stopped'))).toBe(0);
  });

  it('shows nothing for a resource the estimate cannot price', () => {
    const table = estimateCosts(
      [{ id: 'app_1', hourlyPrice: 1, minInstances: 1 }],
      [{ id: 'addon_1', realId: 'keycloak_1', monthlyPrice: null }],
      'EUR',
    );
    expect(shownCost(table, app('app_1'))).toBe(720);
    expect(shownCost(table, addon('addon_1', 'keycloak_1'))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { setLocale } from '../i18n.js';
import {
  buildCostExport,
  costExportCsv,
  costExportFileName,
  costExportJson,
  costExportMarkdown,
} from './cost-export.js';
import type { CostTable } from './costs.js';
import type { GroupNode } from './grouping.js';

const app = (id: string, name: string, tags: string[] = []) =>
  ({ id, name, variantName: 'Node.js & Bun', customerTags: tags }) as unknown as ApplicationSummary;
const addon = (id: string, realId: string, name: string) =>
  ({ id, realId, name, providerId: 'postgresql-addon', customerTags: [] }) as unknown as AddonSummary;

function node(partial: Partial<GroupNode>): GroupNode {
  return {
    path: '',
    level: 1,
    label: '',
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

const API = app('app_api', 'shop-api', ['project:shop', 'env:prod']);
const FRONT = app('app_front', 'shop-front; "beta"');
const DB = addon('addon_db', 'postgresql_db', 'shop-db');

const TABLE: CostTable = {
  source: 'days30',
  currency: 'EUR',
  amounts: new Map([
    ['app_api', 480.123],
    ['postgresql_db', 400],
    ['app_gone', 12.5],
  ]),
  period: { from: '2026-09-20', to: '2026-10-19' },
  reference: '',
};

const TREE = [
  node({
    path: 'project=shop',
    label: 'shop',
    children: [node({ path: 'project=shop/env=prod', level: 2, label: 'prod', apps: [API], addons: [DB] })],
  }),
  node({ path: 'project=', label: 'sans project', missing: true, apps: [FRONT] }),
];

const VIEW = { filter: '', grouping: 'project > env', sort: { column: 'name', direction: 'asc' } } as const;
const NOW = new Date('2026-10-21T10:00:00Z');

describe('cost export', () => {
  const data = buildCostExport({
    organisation: { id: 'orga_1', name: 'Café Démo' },
    table: TABLE,
    tree: TREE,
    view: VIEW,
    now: NOW,
  });

  it('lists the resources in the order of the list, with their group, and what is outside it', () => {
    expect(data.resources.map((resource) => [resource.name, resource.group.join(' > '), resource.amount])).toEqual([
      ['shop-api', 'shop > prod', 480.123],
      ['shop-db', 'shop > prod', 400],
      ['shop-front; "beta"', 'sans project', 0],
    ]);
    expect(data.groups.map((group) => [group.path.join(' > '), group.total])).toEqual([
      ['shop', 880.123],
      ['shop > prod', 880.123],
      ['sans project', 0],
    ]);
    expect(data.total).toBeCloseTo(880.123);
    expect(data.outsideList).toEqual({ count: 1, amount: 12.5 });
  });

  it('writes a French CSV for Excel: semicolons, decimal commas, a BOM, quoted fields', () => {
    setLocale('fr', false);
    const csv = costExportCsv(data, 'fr');
    expect(csv.startsWith('﻿organisation;nom;ressource;type;id;tags;groupe;source;du;au;montant;devise\r\n')).toBe(
      true,
    );
    expect(csv).toContain('Café Démo;shop-api;Application;Node.js & Bun;app_api;project:shop env:prod;shop > prod;');
    expect(csv).toContain(';2026-09-20;2026-10-19;480,12;EUR\r\n');
    expect(csv).toContain(';"shop-front; ""beta""";');
    expect(csv).toContain(';1 ressource;hors liste;;;;;');
  });

  it('writes an English CSV with commas and dots', () => {
    setLocale('en', false);
    const csv = costExportCsv(data, 'en');
    expect(csv).toContain('﻿organisation,name,kind,type,id,tags,group,source,from,to,amount,currency\r\n');
    expect(csv).toContain(',480.12,EUR\r\n');
  });

  it('rounds the JSON amounts to the cent', () => {
    const json = JSON.parse(costExportJson(data));
    expect(json.resources[0].amount).toBe(480.12);
    expect(json.total).toBe(880.12);
    expect(json.view.grouping).toBe('project > env');
    expect(json.generatedAt).toBe('2026-10-21T10:00:00.000Z');
  });

  it('writes one heading per group with its total, and a table of resources under each last-level group', () => {
    setLocale('en', false);
    const markdown = costExportMarkdown(data, 'en');
    expect(markdown).toContain('## Costs of Café Démo');
    expect(markdown).toContain(
      'Last 30 days 2026-09-20 → 2026-10-19 · EUR, tax excluded · total of the list €880.12 · outside the list €12.50 (1 resource)',
    );
    // A group with sub-groups: its heading, no table of its own.
    expect(markdown).toContain('### shop — €880.12\n\n#### shop › prod — €880.12\n\n| resource | type | amount |');
    expect(markdown).toContain('| shop-api | Node.js & Bun | €480.12 |\n| shop-db | postgresql-addon | €400.00 |');
    expect(markdown).toContain(
      '### sans project — €0.00\n\n| resource | type | amount |\n| --- | --- | ---: |\n| shop-front; "beta" |',
    );
  });

  it('lists the most expensive resources without grouping, the rest summed', () => {
    setLocale('en', false);
    const many = Array.from({ length: 52 }, (_, index) => app(`app_${index}`, `app-${index}`));
    const table: CostTable = { ...TABLE, amounts: new Map(many.map((item, index) => [item.id, index + 1])) };
    const flat = buildCostExport({
      organisation: { id: 'orga_1', name: 'Demo' },
      table,
      tree: [node({ level: 0, apps: many })],
      view: { ...VIEW, grouping: '' },
      now: NOW,
    });
    const markdown = costExportMarkdown(flat, 'en');
    expect(markdown.indexOf('| app-51 |')).toBeLessThan(markdown.indexOf('| app-50 |'));
    expect(markdown).not.toContain('| app-1 |');
    expect(markdown).toContain('| 2 other resources | | €3.00 |');
  });

  it('names the file after the organisation, the source and the period', () => {
    expect(costExportFileName(data, 'csv')).toBe('costs-cafe-demo-days30-2026-09-20_2026-10-19.csv');
    const invoice = { ...data, source: 'invoice' as const, period: { from: '2026-09-01', to: '2026-09-30' } };
    expect(costExportFileName(invoice, 'json')).toBe('costs-cafe-demo-invoice-2026-09.json');
    const estimate = { ...data, source: 'estimate' as const, period: null };
    expect(costExportFileName(estimate, 'csv')).toBe('costs-cafe-demo-estimate-2026-10-21.csv');
  });
});

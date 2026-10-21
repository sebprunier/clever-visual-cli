/**
 * The export of the costs (#12): the current list, as filtered and grouped,
 * with the source the cost column shows, as CSV (for spreadsheets), JSON (for
 * scripts) or Markdown (to paste the totals per group). Built from what the
 * page already loaded: no API call, nothing sent anywhere.
 */
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { t, type Locale, type MessageKey } from '../i18n.js';
import { nodeCost, shownCost, totalCost, unlistedCost, type CostSource, type CostTable } from './costs.js';
import type { GroupNode } from './grouping.js';
import type { SortSpec } from './sorting.js';

export interface CostExportResource {
  id: string;
  realId: string | null;
  name: string;
  kind: 'application' | 'add-on';
  type: string;
  tags: string[];
  /** The labels of the groups it sits in, outermost first; empty without grouping. */
  group: string[];
  /** Null when the estimate has no price for it. */
  amount: number | null;
  /** Estimate only: what a stopped application would cost started. */
  ifStarted: number | null;
}

export interface CostExport {
  organisation: { id: string; name: string };
  source: CostSource;
  period: { from: string; to: string } | null;
  invoice: string | null;
  currency: string;
  taxExcluded: true;
  view: { filter: string; grouping: string; sort: SortSpec };
  generatedAt: string;
  resources: CostExportResource[];
  groups: Array<{ path: string[]; total: number }>;
  total: number;
  outsideList: { count: number; amount: number };
}

export interface CostExportInput {
  organisation: { id: string; name: string };
  table: CostTable;
  /** The groups of the list, as `buildHomeList` sorted them. */
  tree: readonly GroupNode[];
  view: { filter: string; grouping: string; sort: SortSpec };
  now?: Date;
}

const SOURCE_LABELS: Record<CostSource, MessageKey> = {
  yesterday: 'costs.yesterday',
  days30: 'costs.days30',
  invoice: 'costs.invoice',
  estimate: 'costs.estimate',
};

/** The rows in the order of the list (applications, then add-ons, group after group), and the totals. */
export function buildCostExport(input: CostExportInput): CostExport {
  const { table, tree } = input;
  const resources: CostExportResource[] = [];
  const groups: CostExport['groups'] = [];
  const listed: Array<{ id: string; realId?: string }> = [];
  const walk = (node: GroupNode, path: string[]) => {
    const here = node.level === 0 ? path : [...path, node.label];
    if (node.level > 0) {
      groups.push({ path: here, total: nodeCost(node, table) });
    }
    if (node.children.length > 0) {
      node.children.forEach((child) => walk(child, here));
      return;
    }
    for (const app of node.apps) {
      listed.push(app);
      resources.push(appRow(app, here, table));
    }
    for (const addon of node.addons) {
      listed.push(addon);
      resources.push(addonRow(addon, here, table));
    }
  };
  tree.forEach((node) => walk(node, []));
  return {
    organisation: input.organisation,
    source: table.source,
    period: table.period == null ? null : { from: day(table.period.from), to: day(table.period.to) },
    invoice: table.reference === '' ? null : table.reference,
    currency: table.currency,
    taxExcluded: true,
    view: input.view,
    generatedAt: (input.now ?? new Date()).toISOString(),
    resources,
    groups,
    total: totalCost(tree, table),
    outsideList: unlistedCost(table, listed),
  };
}

function appRow(app: ApplicationSummary, group: string[], table: CostTable): CostExportResource {
  return {
    id: app.id,
    realId: null,
    name: app.name,
    kind: 'application',
    type: app.variantName,
    tags: app.customerTags,
    group,
    amount: shownCost(table, app),
    ifStarted: table.ifStarted?.get(app.id) ?? null,
  };
}

function addonRow(addon: AddonSummary, group: string[], table: CostTable): CostExportResource {
  return {
    id: addon.id,
    realId: addon.realId,
    name: addon.name,
    kind: 'add-on',
    type: addon.providerId,
    tags: addon.customerTags,
    group,
    amount: shownCost(table, addon),
    ifStarted: null,
  };
}

/** `2026-09-20` from a date or a timestamp. */
function day(value: string): string {
  return value.slice(0, 10);
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- JSON ---------------------------------------------------------------------

export function costExportJson(data: CostExport): string {
  return `${JSON.stringify(
    {
      ...data,
      resources: data.resources.map((resource) => ({
        ...resource,
        amount: resource.amount == null ? null : cents(resource.amount),
        ifStarted: resource.ifStarted == null ? null : cents(resource.ifStarted),
      })),
      groups: data.groups.map((group) => ({ ...group, total: cents(group.total) })),
      total: cents(data.total),
      outsideList: { ...data.outsideList, amount: cents(data.outsideList.amount) },
    },
    null,
    2,
  )}\n`;
}

// --- CSV ----------------------------------------------------------------------

/**
 * In French, `;` and a decimal comma, as Excel expects in France; in English,
 * `,` and a dot (RFC 4180). A byte order mark so Excel reads UTF-8 accents.
 */
export function costExportCsv(data: CostExport, locale: Locale): string {
  const separator = locale === 'fr' ? ';' : ',';
  const amount = (value: number | null) => {
    if (value == null) {
      return '';
    }
    const text = cents(value).toFixed(2);
    return locale === 'fr' ? text.replace('.', ',') : text;
  };
  const estimate = data.source === 'estimate';
  const header: MessageKey[] = [
    'costExport.col.organisation',
    'costExport.col.name',
    'costExport.col.kind',
    'costExport.col.type',
    'costExport.col.id',
    'costExport.col.tags',
    'costExport.col.group',
    'costExport.col.source',
    'costExport.col.from',
    'costExport.col.to',
    'costExport.col.amount',
    ...(estimate ? (['costExport.col.ifStarted'] as MessageKey[]) : []),
    'costExport.col.currency',
  ];
  const source = t(SOURCE_LABELS[data.source]);
  const from = data.period?.from ?? '';
  const to = data.period?.to ?? '';
  const rows: string[][] = [header.map((key) => t(key))];
  for (const resource of data.resources) {
    rows.push([
      data.organisation.name,
      resource.name,
      t(resource.kind === 'application' ? 'home.kind.app' : 'home.kind.addon'),
      resource.type,
      resource.id,
      resource.tags.join(' '),
      resource.group.join(' > '),
      source,
      from,
      to,
      amount(resource.amount),
      ...(estimate ? [amount(resource.ifStarted)] : []),
      data.currency,
    ]);
  }
  if (data.outsideList.count > 0) {
    rows.push([
      data.organisation.name,
      t('costExport.outsideName', { count: data.outsideList.count }),
      t('costExport.outsideKind'),
      '',
      '',
      '',
      '',
      source,
      from,
      to,
      amount(data.outsideList.amount),
      ...(estimate ? [''] : []),
      data.currency,
    ]);
  }
  return `﻿${rows.map((row) => row.map((field) => csvField(field, separator)).join(separator)).join('\r\n')}\r\n`;
}

function csvField(value: string, separator: string): string {
  return value.includes(separator) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// --- Markdown -------------------------------------------------------------------

/** Without grouping, the most expensive resources only, the rest summed in one line. */
const MARKDOWN_MAX_ROWS = 50;

/**
 * To paste in an issue or a document: the source, the total of the list and
 * what is outside it, then one heading per group and sub-group with its total
 * (sub-groups named by their path, so they read on their own), and under each
 * last-level group a table of its resources in the order of the list. Without
 * grouping, one table of the resources, highest first.
 */
export function costExportMarkdown(data: CostExport, locale: Locale): string {
  const money = moneyFormat(locale, data.currency);
  const amount = (value: number | null) => (value == null ? '—' : money(value));
  const cell = (text: string) => text.replaceAll('|', '\\|');
  const table = (resources: readonly CostExportResource[]) => [
    `| ${t('costExport.md.resource')} | ${t('costExport.col.type')} | ${t('costExport.col.amount')} |`,
    '| --- | --- | ---: |',
    ...resources.map((resource) => `| ${cell(resource.name)} | ${cell(resource.type)} | ${amount(resource.amount)} |`),
  ];
  const lines = [
    `## ${t('costExport.md.title', { organisation: data.organisation.name })}`,
    '',
    summaryLine(data, money),
  ];
  if (data.groups.length === 0) {
    const sorted = [...data.resources].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    lines.push('', ...table(sorted.slice(0, MARKDOWN_MAX_ROWS)));
    const rest = sorted.slice(MARKDOWN_MAX_ROWS);
    if (rest.length > 0) {
      const sum = rest.reduce((total, resource) => total + (resource.amount ?? 0), 0);
      lines.push(`| ${t('costExport.md.others', { count: rest.length })} | | ${money(sum)} |`);
    }
    return `${lines.join('\n')}\n`;
  }
  const key = (path: readonly string[]) => path.join('\u0000');
  for (const group of data.groups) {
    const depth = group.path.length;
    lines.push('', `${'#'.repeat(2 + depth)} ${cell(group.path.join(' › '))} — ${money(group.total)}`);
    const parent = data.groups.some(
      (other) => other.path.length === depth + 1 && key(other.path.slice(0, depth)) === key(group.path),
    );
    if (!parent) {
      lines.push('', ...table(data.resources.filter((resource) => key(resource.group) === key(group.path))));
    }
  }
  return `${lines.join('\n')}\n`;
}

/** The source and its period, the currency, the total of the list and what is outside it. */
function summaryLine(data: CostExport, money: (value: number) => string): string {
  const source = t(SOURCE_LABELS[data.source]);
  const period =
    data.period == null
      ? ''
      : data.period.from === data.period.to
        ? ` ${data.period.from}`
        : ` ${data.period.from} → ${data.period.to}`;
  const invoice = data.invoice == null ? '' : ` ${data.invoice}`;
  const parts = [
    t('costExport.md.source', { source: `${source}${invoice}${period}`, currency: data.currency }),
    t('costExport.md.total', { amount: money(data.total) }),
  ];
  if (data.outsideList.count > 0) {
    parts.push(t('costExport.md.outside', { amount: money(data.outsideList.amount), count: data.outsideList.count }));
  }
  return parts.join(' · ');
}

function moneyFormat(locale: Locale, currency: string): (value: number) => string {
  try {
    const format = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
    return (value) => format.format(value);
  } catch {
    return (value) => `${cents(value).toFixed(2)} ${currency}`;
  }
}

// --- file name ------------------------------------------------------------------

/** `costs-maif-innovation-days30-2026-09-20_2026-10-19.csv` */
export function costExportFileName(data: CostExport, extension: 'csv' | 'json'): string {
  const organisation =
    data.organisation.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || data.organisation.id;
  let period: string;
  if (data.source === 'estimate' || data.period == null) {
    period = data.generatedAt.slice(0, 10);
  } else if (data.source === 'invoice') {
    period = data.period.from.slice(0, 7);
  } else if (data.period.from === data.period.to) {
    period = data.period.from;
  } else {
    period = `${data.period.from}_${data.period.to}`;
  }
  return `costs-${organisation}-${data.source}-${period}.${extension}`;
}

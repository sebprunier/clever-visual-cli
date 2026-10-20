/**
 * What the overview of an application derives from the raw API data: its
 * domains arranged for long lists, and its running instances summed up.
 */
import type { Instance } from '../../data/api.js';

export interface DomainEntry {
  domain: string;
  isPrimary: boolean;
}

export interface ArrangedDomains {
  /** The domain links point to, unless it is the default one. */
  primary: DomainEntry | null;
  /** The others, alphabetical. */
  others: DomainEntry[];
  /** The `app-<id>.cleverapps.io` domain every application gets. */
  fallback: DomainEntry | null;
}

/** The domain Clever Cloud gives every application: `app-<uuid>.cleverapps.io`. */
export function isDefaultDomain(domain: string): boolean {
  return /^app-[0-9a-f-]+\.cleverapps\.io\/?$/i.test(domain);
}

export function arrangeDomains(domains: readonly DomainEntry[]): ArrangedDomains {
  const fallback = domains.find((entry) => isDefaultDomain(entry.domain)) ?? null;
  const rest = domains.filter((entry) => entry !== fallback);
  const primary = rest.find((entry) => entry.isPrimary) ?? null;
  const others = rest.filter((entry) => entry !== primary).sort((a, b) => a.domain.localeCompare(b.domain, 'en'));
  return { primary, others, fallback };
}

/** Case-insensitive match on any part of the domain. */
export function filterDomains(domains: readonly DomainEntry[], needle: string): DomainEntry[] {
  const query = needle.trim().toLowerCase();
  return query === '' ? [...domains] : domains.filter((entry) => entry.domain.toLowerCase().includes(query));
}

export interface InstancesSummary {
  /** Running instances by flavor, as "2 × XS". */
  up: Array<{ flavor: string; count: number }>;
  /** The other application instances by state: starting, deploying, stopping… */
  others: Array<{ state: Instance['state']; count: number }>;
  /** A dedicated build instance is at work. */
  building: boolean;
}

const RUNNING: ReadonlySet<Instance['state']> = new Set(['UP', 'READY']);

export function summarizeInstances(instances: readonly Instance[]): InstancesSummary {
  const up = new Map<string, number>();
  const others = new Map<Instance['state'], number>();
  let building = false;
  for (const instance of instances) {
    if (instance.state === 'DELETED') {
      continue;
    }
    if (instance.isBuildVm) {
      building = true;
      continue;
    }
    if (RUNNING.has(instance.state)) {
      const flavor = instance.flavor ?? '?';
      up.set(flavor, (up.get(flavor) ?? 0) + 1);
    } else {
      others.set(instance.state, (others.get(instance.state) ?? 0) + 1);
    }
  }
  return {
    up: [...up].map(([flavor, count]) => ({ flavor, count })),
    others: [...others].map(([state, count]) => ({ state, count })),
    building,
  };
}

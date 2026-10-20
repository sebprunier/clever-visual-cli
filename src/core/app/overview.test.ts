import { describe, expect, it } from 'vitest';
import type { Instance } from '../../data/api.js';
import { arrangeDomains, filterDomains, isDefaultDomain, summarizeInstances } from './overview.js';

describe('arrangeDomains', () => {
  it('puts the primary first, the default domain apart and the rest in order', () => {
    const arranged = arrangeDomains([
      { domain: 'b.example.com', isPrimary: false },
      { domain: 'app-5a9e4e15-429d-43ba-a608-6fb3876620e6.cleverapps.io/', isPrimary: false },
      { domain: 'www.example.com', isPrimary: true },
      { domain: 'a.example.com', isPrimary: false },
    ]);
    expect(arranged.primary?.domain).toBe('www.example.com');
    expect(arranged.others.map((entry) => entry.domain)).toEqual(['a.example.com', 'b.example.com']);
    expect(arranged.fallback?.domain).toMatch(/cleverapps\.io/);
  });

  it('keeps a primary default domain apart rather than on top', () => {
    const arranged = arrangeDomains([{ domain: 'app-1234-abcd.cleverapps.io', isPrimary: true }]);
    expect(arranged.primary).toBeNull();
    expect(arranged.fallback?.isPrimary).toBe(true);
  });

  it('tells the default domain from a custom cleverapps.io one', () => {
    expect(isDefaultDomain('app-1234-abcd.cleverapps.io/')).toBe(true);
    expect(isDefaultDomain('trombi.cleverapps.io')).toBe(false);
  });

  it('filters on any part of the domain', () => {
    const domains = [
      { domain: 'shop.example.com', isPrimary: false },
      { domain: 'blog.example.org', isPrimary: false },
    ];
    expect(filterDomains(domains, ' ORG ').map((entry) => entry.domain)).toEqual(['blog.example.org']);
    expect(filterDomains(domains, '')).toHaveLength(2);
  });
});

describe('summarizeInstances', () => {
  const instance = (state: Instance['state'], flavor: string, isBuildVm = false) =>
    ({ state, flavor, isBuildVm }) as Instance;

  it('counts running instances by flavor, the others by state, and spots a build', () => {
    const summary = summarizeInstances([
      instance('UP', 'XS'),
      instance('UP', 'XS'),
      instance('READY', 'S'),
      instance('DEPLOYING', 'XS'),
      instance('BUILDING', 'M', true),
      instance('DELETED', 'XS'),
    ]);
    expect(summary.up).toEqual([
      { flavor: 'XS', count: 2 },
      { flavor: 'S', count: 1 },
    ]);
    expect(summary.others).toEqual([{ state: 'DEPLOYING', count: 1 }]);
    expect(summary.building).toBe(true);
  });
});

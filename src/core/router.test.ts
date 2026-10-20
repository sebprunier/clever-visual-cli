import { describe, expect, it } from 'vitest';
import { keepListView, parseRoute, readListView, routeOwner, routeToHash, withListView, type Route } from './router.js';

describe('router', () => {
  it('parses the home route from empty or root hashes', () => {
    expect(parseRoute('')).toEqual({ kind: 'home' });
    expect(parseRoute('#')).toEqual({ kind: 'home' });
    expect(parseRoute('#/')).toEqual({ kind: 'home' });
    expect(parseRoute('#/unknown/thing')).toEqual({ kind: 'home' });
  });

  it('parses organisation and application routes', () => {
    expect(parseRoute('#/orga/orga_1')).toEqual({ kind: 'orga', ownerId: 'orga_1' });
    expect(parseRoute('#/orga/orga_1/app/app_2')).toEqual({
      kind: 'app',
      ownerId: 'orga_1',
      appId: 'app_2',
      tab: 'overview',
    });
    expect(parseRoute('#/orga/orga_1/app/app_2/logs')).toEqual({
      kind: 'app',
      ownerId: 'orga_1',
      appId: 'app_2',
      tab: 'logs',
    });
    expect(parseRoute('#/orga/orga_1/app/app_2/nope')).toEqual({
      kind: 'app',
      ownerId: 'orga_1',
      appId: 'app_2',
      tab: 'overview',
    });
  });

  it('round-trips every route through routeToHash', () => {
    const routes: Route[] = [
      { kind: 'home' },
      { kind: 'account' },
      { kind: 'orga', ownerId: 'user_abc' },
      { kind: 'app', ownerId: 'orga_1', appId: 'app_2', tab: 'overview' },
      { kind: 'app', ownerId: 'orga_1', appId: 'app_2', tab: 'env' },
    ];
    for (const route of routes) {
      expect(parseRoute(routeToHash(route))).toEqual(route);
    }
  });
});

describe('router hash params', () => {
  it('ignores the query string when parsing and edits it without touching the route', async () => {
    const { readHashParams, withHashParams } = await import('./router.js');
    expect(parseRoute('#/orga/orga_1?q=is%3Aapp&g=project')).toEqual({ kind: 'orga', ownerId: 'orga_1' });
    expect(readHashParams('#/orga/orga_1?q=is%3Aapp&g=project').get('q')).toBe('is:app');
    expect(withHashParams('#/orga/orga_1', { q: 'is:app AND env:prod', g: null })).toBe(
      '#/orga/orga_1?q=is%3Aapp+AND+env%3Aprod',
    );
    expect(withHashParams('#/orga/orga_1?q=x&g=project', { q: '' })).toBe('#/orga/orga_1?g=project');
    expect(withHashParams('#/orga/orga_1?q=x', { q: null })).toBe('#/orga/orga_1');
  });
});

describe('list view', () => {
  it('carries the filter and grouping, dropping empty ones', () => {
    expect(withListView('#/orga/o1/app/a1', { filter: ' env:prod ', grouping: 'project' })).toBe(
      '#/orga/o1/app/a1?q=env%3Aprod&g=project',
    );
    expect(withListView('#/orga/o1?q=old', { filter: '', grouping: '' })).toBe('#/orga/o1');
    expect(readListView('#/orga/o1/app/a1?g=project')).toEqual({ filter: null, grouping: 'project' });
  });

  it('follows a navigation inside the same organisation only', () => {
    const route: Route = { kind: 'app', ownerId: 'o1', appId: 'a2', tab: 'logs' };
    expect(keepListView('#/orga/o1/app/a2/logs', route, '#/orga/o1/app/a1?q=env%3Aprod&g=project')).toBe(
      '#/orga/o1/app/a2/logs?q=env%3Aprod&g=project',
    );
    expect(keepListView('#/orga/o2/app/a2/logs', { ...route, ownerId: 'o2' }, '#/orga/o1?q=x')).toBe(
      '#/orga/o2/app/a2/logs',
    );
    expect(keepListView('#/account', { kind: 'account' }, '#/orga/o1?q=x')).toBe('#/account');
  });
});

describe('add-on pages', () => {
  it('have a route with their tabs', () => {
    expect(parseRoute('#/orga/o1/addon/addon_1')).toEqual({
      kind: 'addon',
      ownerId: 'o1',
      addonId: 'addon_1',
      tab: 'overview',
    });
    expect(parseRoute('#/orga/o1/addon/addon_1/logs?q=x')).toEqual({
      kind: 'addon',
      ownerId: 'o1',
      addonId: 'addon_1',
      tab: 'logs',
    });
    expect(routeToHash({ kind: 'addon', ownerId: 'o1', addonId: 'addon_1', tab: 'env' })).toBe(
      '#/orga/o1/addon/addon_1/env',
    );
    expect(routeOwner({ kind: 'addon', ownerId: 'o1', addonId: 'addon_1', tab: 'overview' })).toBe('o1');
  });
});

describe('logs of several applications', () => {
  it('has a route of its own, the applications in the query', () => {
    expect(parseRoute('#/orga/o1/logs?apps=a1,a2')).toEqual({ kind: 'logs', ownerId: 'o1' });
    expect(routeToHash({ kind: 'logs', ownerId: 'o1' })).toBe('#/orga/o1/logs');
    expect(routeOwner({ kind: 'logs', ownerId: 'o1' })).toBe('o1');
    expect(routeOwner({ kind: 'account' })).toBeNull();
  });

  it('keeps the list of the organisation on the way to and from it', () => {
    expect(keepListView('#/orga/o1', { kind: 'orga', ownerId: 'o1' }, '#/orga/o1/logs?apps=a1&q=env%3Aprod')).toBe(
      '#/orga/o1?q=env%3Aprod',
    );
  });
});

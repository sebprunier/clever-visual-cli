import { describe, expect, it } from 'vitest';
import { parseRoute, routeToHash, type Route } from './router.js';

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

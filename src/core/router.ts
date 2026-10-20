/**
 * Hash-based router: `#/orga/<ownerId>/app/<appId>/<tab>`, and
 * `#/orga/<ownerId>/logs?apps=…` for the logs of several applications.
 *
 * Hash routing needs no server-side rewrite, so the build runs unchanged on
 * any static host (Clever Cloud static, GitHub Pages, a local `file://`).
 */

export const APP_TABS = ['overview', 'logs', 'deployments', 'domains', 'env', 'dependencies'] as const;
export type AppTab = (typeof APP_TABS)[number];
export const ADDON_TABS = ['overview', 'buckets', 'env', 'logs', 'backups'] as const;
export type AddonTab = (typeof ADDON_TABS)[number];

export type Route =
  | { kind: 'home' }
  | { kind: 'orga'; ownerId: string }
  | { kind: 'app'; ownerId: string; appId: string; tab: AppTab }
  | { kind: 'addon'; ownerId: string; addonId: string; tab: AddonTab }
  /** The logs of several applications, listed in `?apps=`. */
  | { kind: 'logs'; ownerId: string }
  | { kind: 'account' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(decodeURIComponent);

  if (segments.length === 0) {
    return { kind: 'home' };
  }
  if (segments[0] === 'account') {
    return { kind: 'account' };
  }
  if (segments[0] === 'orga' && segments[1] != null) {
    const ownerId = segments[1];
    if (segments[2] === 'app' && segments[3] != null) {
      const tab = isAppTab(segments[4]) ? segments[4] : 'overview';
      return { kind: 'app', ownerId, appId: segments[3], tab };
    }
    if (segments[2] === 'addon' && segments[3] != null) {
      const tab = isAddonTab(segments[4]) ? segments[4] : 'overview';
      return { kind: 'addon', ownerId, addonId: segments[3], tab };
    }
    if (segments[2] === 'logs') {
      return { kind: 'logs', ownerId };
    }
    return { kind: 'orga', ownerId };
  }
  return { kind: 'home' };
}

export function routeToHash(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '#/';
    case 'account':
      return '#/account';
    case 'orga':
      return `#/orga/${encodeURIComponent(route.ownerId)}`;
    case 'app': {
      const base = `#/orga/${encodeURIComponent(route.ownerId)}/app/${encodeURIComponent(route.appId)}`;
      return route.tab === 'overview' ? base : `${base}/${route.tab}`;
    }
    case 'addon': {
      const base = `#/orga/${encodeURIComponent(route.ownerId)}/addon/${encodeURIComponent(route.addonId)}`;
      return route.tab === 'overview' ? base : `${base}/${route.tab}`;
    }
    case 'logs':
      return `#/orga/${encodeURIComponent(route.ownerId)}/logs`;
  }
}

/** Pages of one organisation: they carry its list and keep it selected in the top bar. */
export function routeOwner(route: Route): string | null {
  return route.kind === 'orga' || route.kind === 'app' || route.kind === 'addon' || route.kind === 'logs'
    ? route.ownerId
    : null;
}

/** Navigates; within one organisation, the list the user comes from (`?q=&g=`) follows along. */
export function navigate(route: Route): void {
  const hash = keepListView(routeToHash(route), route, window.location.hash);
  if (window.location.hash === hash) {
    return;
  }
  window.location.hash = hash;
}

export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}

/** Calls `listener` now and on every hash change; returns the unsubscribe function. */
export function watchRoute(listener: (route: Route) => void): () => void {
  const handler = () => listener(currentRoute());
  window.addEventListener('hashchange', handler);
  handler();
  return () => window.removeEventListener('hashchange', handler);
}

function isAddonTab(value: string | undefined): value is AddonTab {
  return value != null && (ADDON_TABS as readonly string[]).includes(value);
}

function isAppTab(value: string | undefined): value is AppTab {
  return value != null && (APP_TABS as readonly string[]).includes(value);
}

/** Query parameters carried after the route, as in `#/orga/<id>?q=…&g=…`. */
export function readHashParams(hash = window.location.hash): URLSearchParams {
  const index = hash.indexOf('?');
  return new URLSearchParams(index === -1 ? '' : hash.slice(index + 1));
}

/** Sets or removes (`null` or empty) query parameters of the current route without a navigation. */
export function writeHashParams(params: Record<string, string | null>): void {
  const hash = window.location.hash;
  const next = withHashParams(hash, params);
  if (next !== hash) {
    history.replaceState(null, '', next);
  }
}

export function withHashParams(hash: string, params: Record<string, string | null>): string {
  const index = hash.indexOf('?');
  const base = index === -1 ? hash : hash.slice(0, index);
  const search = new URLSearchParams(index === -1 ? '' : hash.slice(index + 1));
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') {
      search.delete(key);
    } else {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query === '' ? base : `${base}?${query}`;
}

/**
 * The home list a page shows or comes from: the filter and grouping
 * expressions, carried as `?q=&g=` by the home page and by application pages,
 * whose column shows the same list.
 */
export interface ListView {
  filter: string;
  grouping: string;
}

/** `null` for a parameter the hash does not carry, so a default can apply. */
export function readListView(hash = window.location.hash): { filter: string | null; grouping: string | null } {
  const params = readHashParams(hash);
  return { filter: params.get('q'), grouping: params.get('g') };
}

export function withListView(hash: string, view: ListView): string {
  return withHashParams(hash, { q: view.filter.trim(), g: view.grouping.trim() });
}

/** The target hash with the list of the current one when both are pages of the same organisation. */
export function keepListView(target: string, route: Route, currentHash: string): string {
  const owner = routeOwner(route);
  if (owner == null || routeOwner(parseRoute(currentHash)) !== owner) {
    return target;
  }
  const { filter, grouping } = readListView(currentHash);
  return withHashParams(target, { q: filter, g: grouping });
}

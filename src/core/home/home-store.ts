/**
 * Data the home page needs beyond the summary, per organisation:
 *
 * - the organisation-wide deployment list (one request, refreshed when stale);
 * - the links of every application (two requests per application, fetched
 *   with a small concurrency, kept in localStorage so the next visit starts
 *   from the cache and only new applications are fetched).
 *
 * Emits `change` whenever something arrives, including partial link results.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { fetchApplicationLinks, fetchOrganisationDeployments, type Deployment } from '../../data/api.js';
import { describeError } from '../clever-client.js';
import type { AppLinks } from './grouping.js';

export interface OwnerHomeData {
  deployments: Deployment[] | null;
  deploymentsAt: number;
  deploymentsError: string | null;
  deploymentsLoading: boolean;
  links: Record<string, AppLinks>;
  /** When the links of every application were last known complete; 0 when never. */
  linksAt: number;
  /** Applications whose links are still being fetched. */
  linksPending: number;
  linksError: string | null;
}

export interface RefreshOptions {
  /** Reload the deployments even when fresh. */
  force?: boolean;
  /** Also refetch the links of every application. */
  forceLinks?: boolean;
}

const DEPLOYMENTS_TTL = 60_000;
const LINKS_TTL = 60 * 60_000;
const LINKS_CONCURRENCY = 6;

interface StoredLinks {
  at: number;
  links: Record<string, AppLinks>;
}

export class HomeStore extends EventTarget {
  #data = new Map<string, OwnerHomeData>();
  #inflight = new Map<string, Promise<void>>();

  get(ownerId: string): OwnerHomeData {
    let data = this.#data.get(ownerId);
    if (data == null) {
      const stored = readLinks(ownerId);
      data = {
        deployments: null,
        deploymentsAt: 0,
        deploymentsError: null,
        deploymentsLoading: false,
        links: stored?.links ?? {},
        linksAt: stored?.at ?? 0,
        linksPending: 0,
        linksError: null,
      };
      this.#data.set(ownerId, data);
    }
    return data;
  }

  /** Loads what is stale or missing for `ownerId`; resolves when everything settled. */
  refresh(
    client: CcApiClient,
    ownerId: string,
    appIds: readonly string[],
    options: RefreshOptions = {},
  ): Promise<void> {
    const key = ownerId;
    const running = this.#inflight.get(key);
    if (running != null && !options.force) {
      return running;
    }
    const promise = Promise.all([
      this.#refreshDeployments(client, ownerId, options),
      this.#refreshLinks(client, ownerId, appIds, options),
    ]).then(() => undefined);
    this.#inflight.set(key, promise);
    void promise.finally(() => {
      if (this.#inflight.get(key) === promise) {
        this.#inflight.delete(key);
      }
    });
    return promise;
  }

  forget(): void {
    this.#data.clear();
    this.#emit();
  }

  /** The links of one application as just read or changed, without waiting for the next refresh. */
  setLinks(ownerId: string, appId: string, links: AppLinks): void {
    const data = this.get(ownerId);
    const known = data.links[appId];
    if (
      known != null &&
      sameIds(known.addonIds, links.addonIds) &&
      sameIds(known.applicationIds, links.applicationIds)
    ) {
      return;
    }
    data.links[appId] = links;
    if (data.linksAt > 0) {
      writeLinks(ownerId, { at: data.linksAt, links: data.links });
    }
    this.#emit();
  }

  async #refreshDeployments(client: CcApiClient, ownerId: string, options: RefreshOptions): Promise<void> {
    const data = this.get(ownerId);
    const fresh = Date.now() - data.deploymentsAt < DEPLOYMENTS_TTL;
    if (data.deploymentsLoading || (fresh && !options.force && data.deployments != null)) {
      return;
    }
    data.deploymentsLoading = true;
    this.#emit();
    try {
      data.deployments = await fetchOrganisationDeployments(client, ownerId);
      data.deploymentsAt = Date.now();
      data.deploymentsError = null;
    } catch (error) {
      data.deploymentsError = describeError(error);
    } finally {
      data.deploymentsLoading = false;
      this.#emit();
    }
  }

  async #refreshLinks(
    client: CcApiClient,
    ownerId: string,
    appIds: readonly string[],
    options: RefreshOptions,
  ): Promise<void> {
    const data = this.get(ownerId);
    if (data.linksPending > 0) {
      return;
    }
    const stale = Date.now() - data.linksAt > LINKS_TTL;
    const todo = options.forceLinks || stale ? [...appIds] : appIds.filter((appId) => data.links[appId] == null);
    const current = new Set(appIds);
    for (const appId of Object.keys(data.links)) {
      if (!current.has(appId)) {
        delete data.links[appId];
      }
    }
    if (todo.length === 0) {
      return;
    }
    data.linksPending = todo.length;
    data.linksError = null;
    this.#emit();
    let next = 0;
    let completed = 0;
    const worker = async () => {
      while (next < todo.length) {
        const appId = todo[next++];
        try {
          data.links[appId] = await fetchApplicationLinks(client, ownerId, appId);
        } catch (error) {
          data.linksError = describeError(error);
        } finally {
          completed += 1;
          data.linksPending = todo.length - completed;
          if (completed % 8 === 0 || data.linksPending === 0) {
            this.#emit();
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(LINKS_CONCURRENCY, todo.length) }, worker));
    if (data.linksError == null) {
      data.linksAt = Date.now();
      writeLinks(ownerId, { at: data.linksAt, links: data.links });
    }
    this.#emit();
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function linksKey(ownerId: string): string {
  return `cvc.links.${ownerId}`;
}

function readLinks(ownerId: string): StoredLinks | null {
  try {
    const raw = localStorage.getItem(linksKey(ownerId));
    if (raw == null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredLinks>;
    if (typeof parsed.at !== 'number' || typeof parsed.links !== 'object' || parsed.links == null) {
      return null;
    }
    return { at: parsed.at, links: parsed.links };
  } catch {
    return null;
  }
}

function writeLinks(ownerId: string, stored: StoredLinks): void {
  try {
    localStorage.setItem(linksKey(ownerId), JSON.stringify(stored));
  } catch {
    // Not essential.
  }
}

/** Removes everything the home page keeps in localStorage: link caches, preferences, recent visits. */
export function clearHomeStorage(): void {
  try {
    const keys = Object.keys(localStorage).filter(
      (key) => key.startsWith('cvc.links.') || key.startsWith('cvc.home.') || key === 'cvc.recents',
    );
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Not essential.
  }
}

import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import {
  fetchProfile,
  fetchSummary,
  type ApplicationSummary,
  type OrganisationSummary,
  type Summary,
} from '../data/api.js';
import { createClient, describeError } from './clever-client.js';
import type { Credentials } from './credentials.js';
import type { StoredProfile, Vault } from './vault/vault.js';

export interface AccountInfo {
  userId: string;
  email: string;
  name?: string;
}

/**
 * The live part of the state: which stored profile is active, the API client
 * built for it, and the summary (organisations, applications, add-ons) that
 * every page and the command palette read from.
 */
export class Session extends EventTarget {
  readonly vault: Vault;
  #client: CcApiClient | null = null;
  #profile: StoredProfile | null = null;
  #summary: Summary | null = null;
  #summaryError: string | null = null;
  #loading = false;

  constructor(vault: Vault) {
    super();
    this.vault = vault;
  }

  get client(): CcApiClient | null {
    return this.#client;
  }

  get profile(): StoredProfile | null {
    return this.#profile;
  }

  get summary(): Summary | null {
    return this.#summary;
  }

  get summaryError(): string | null {
    return this.#summaryError;
  }

  get loading(): boolean {
    return this.#loading;
  }

  get organisations(): OrganisationSummary[] {
    return this.#summary?.organisations ?? [];
  }

  findOrganisation(ownerId: string): OrganisationSummary | null {
    return this.organisations.find((orga) => orga.id === ownerId) ?? null;
  }

  findApplication(appId: string): { orga: OrganisationSummary; app: ApplicationSummary } | null {
    for (const orga of this.organisations) {
      const app = orga.applications.find((candidate) => candidate.id === appId);
      if (app != null) {
        return { orga, app };
      }
    }
    return null;
  }

  /** Checks credentials against the API without touching the vault. */
  async verify(credentials: Credentials): Promise<AccountInfo> {
    const profile = await fetchProfile(createClient(credentials));
    return { userId: profile.id, email: profile.emailAddress, name: profile.name };
  }

  async activate(profile: StoredProfile): Promise<void> {
    this.#profile = profile;
    this.#client = createClient(profile.credentials);
    this.#summary = null;
    this.#summaryError = null;
    this.#emit();
    await this.refreshSummary();
  }

  async refreshSummary(): Promise<void> {
    if (this.#client == null) {
      return;
    }
    const client = this.#client;
    this.#loading = true;
    this.#emit();
    try {
      const summary = await fetchSummary(client);
      if (this.#client === client) {
        this.#summary = summary;
        this.#summaryError = null;
      }
    } catch (error) {
      if (this.#client === client) {
        this.#summaryError = describeError(error);
      }
    } finally {
      if (this.#client === client) {
        this.#loading = false;
        this.#emit();
      }
    }
  }

  deactivate(): void {
    this.#client = null;
    this.#profile = null;
    this.#summary = null;
    this.#summaryError = null;
    this.#loading = false;
    this.#emit();
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

import { t } from '../i18n.js';
import type { Credentials } from '../credentials.js';
import {
  decryptJson,
  deriveKey,
  encryptJson,
  exportKey,
  fromBase64,
  importKey,
  isEncryptedBlob,
  type DerivedKey,
  type EncryptedBlob,
} from './crypto.js';

/**
 * The credential vault: every account the user added, plus which one is active.
 *
 * Two persistence modes, chosen by the user when the first account is added:
 *
 * - `encrypted`: the vault lives in localStorage as an AES-GCM blob. The key is
 *   derived from a passphrase and kept in memory. To survive a reload without
 *   asking the passphrase again, the raw key is also kept in sessionStorage for
 *   the lifetime of the tab. Trade-off: a script running in this origin could
 *   read it while the tab is open, which is the same exposure as the unlocked
 *   state itself. Closing the tab or locking wipes it.
 * - `session`: plain JSON in sessionStorage, gone when the tab closes. Nothing
 *   touches the disk beyond what the browser does with sessionStorage.
 */

export interface StoredProfile {
  id: string;
  alias: string;
  credentials: Credentials;
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface VaultData {
  version: 1;
  profiles: StoredProfile[];
  activeProfileId: string | null;
}

export type VaultState = 'empty' | 'locked' | 'unlocked';
export type VaultMode = 'encrypted' | 'session';

const LOCAL_KEY = 'cvc.vault';
const SESSION_KEY_KEY = 'cvc.vault.key';
const SESSION_DATA_KEY = 'cvc.vault.session';

const EMPTY_DATA: VaultData = { version: 1, profiles: [], activeProfileId: null };

export class Vault extends EventTarget {
  #state: VaultState = 'empty';
  #mode: VaultMode | null = null;
  #data: VaultData = EMPTY_DATA;
  #derived: DerivedKey | null = null;
  #blob: EncryptedBlob | null = null;

  get state(): VaultState {
    return this.#state;
  }

  get mode(): VaultMode | null {
    return this.#mode;
  }

  get profiles(): readonly StoredProfile[] {
    return this.#data.profiles;
  }

  get activeProfile(): StoredProfile | null {
    return this.#data.profiles.find((profile) => profile.id === this.#data.activeProfileId) ?? null;
  }

  /** Reads whatever is in storage and auto-unlocks when the tab still holds the key. */
  static async load(): Promise<Vault> {
    const vault = new Vault();
    const blob = readJson(localStorage, LOCAL_KEY);
    if (isEncryptedBlob(blob)) {
      vault.#blob = blob;
      vault.#mode = 'encrypted';
      vault.#state = 'locked';
      const rawKey = readString(sessionStorage, SESSION_KEY_KEY);
      if (rawKey != null) {
        try {
          const key = await importKey(rawKey);
          vault.#data = await decryptJson<VaultData>(key, blob);
          vault.#derived = { key, salt: fromBase64(blob.salt), iterations: blob.iterations };
          vault.#state = 'unlocked';
        } catch {
          removeItem(sessionStorage, SESSION_KEY_KEY);
        }
      }
      return vault;
    }

    const sessionData = readJson(sessionStorage, SESSION_DATA_KEY);
    if (isVaultData(sessionData)) {
      vault.#data = sessionData;
      vault.#mode = 'session';
      vault.#state = 'unlocked';
    }
    return vault;
  }

  async unlock(passphrase: string): Promise<void> {
    if (this.#blob == null) {
      throw new Error(t('vault.none'));
    }
    const derived = await deriveKey(passphrase, fromBase64(this.#blob.salt), this.#blob.iterations);
    this.#data = await decryptJson<VaultData>(derived.key, this.#blob);
    this.#derived = derived;
    this.#state = 'unlocked';
    writeString(sessionStorage, SESSION_KEY_KEY, await exportKey(derived.key));
    this.#emit();
  }

  lock(): void {
    if (this.#mode !== 'encrypted') {
      return;
    }
    this.#derived = null;
    this.#data = EMPTY_DATA;
    this.#state = 'locked';
    removeItem(sessionStorage, SESSION_KEY_KEY);
    this.#emit();
  }

  /** First account, encrypted mode: creates the vault with this passphrase. */
  async createEncrypted(passphrase: string, profile: StoredProfile): Promise<void> {
    this.#derived = await deriveKey(passphrase);
    this.#mode = 'encrypted';
    this.#data = { version: 1, profiles: [profile], activeProfileId: profile.id };
    this.#state = 'unlocked';
    removeItem(sessionStorage, SESSION_DATA_KEY);
    writeString(sessionStorage, SESSION_KEY_KEY, await exportKey(this.#derived.key));
    await this.#persist();
  }

  /** First account, session mode: nothing survives the tab. */
  async createSessionOnly(profile: StoredProfile): Promise<void> {
    this.#mode = 'session';
    this.#data = { version: 1, profiles: [profile], activeProfileId: profile.id };
    this.#state = 'unlocked';
    await this.#persist();
  }

  async addProfile(profile: StoredProfile): Promise<void> {
    this.#assertUnlocked();
    const others = this.#data.profiles.filter((p) => p.id !== profile.id && p.alias !== profile.alias);
    this.#data = { ...this.#data, profiles: [profile, ...others], activeProfileId: profile.id };
    await this.#persist();
  }

  async removeProfile(profileId: string): Promise<void> {
    this.#assertUnlocked();
    const profiles = this.#data.profiles.filter((p) => p.id !== profileId);
    const activeProfileId =
      this.#data.activeProfileId === profileId ? (profiles[0]?.id ?? null) : this.#data.activeProfileId;
    this.#data = { ...this.#data, profiles, activeProfileId };
    if (profiles.length === 0) {
      this.destroy();
      return;
    }
    await this.#persist();
  }

  async setActiveProfile(profileId: string): Promise<void> {
    this.#assertUnlocked();
    if (!this.#data.profiles.some((p) => p.id === profileId)) {
      throw new Error(t('vault.unknownProfile'));
    }
    this.#data = { ...this.#data, activeProfileId: profileId };
    await this.#persist();
  }

  /** Wipes everything, encrypted or not. */
  destroy(): void {
    removeItem(localStorage, LOCAL_KEY);
    removeItem(sessionStorage, SESSION_KEY_KEY);
    removeItem(sessionStorage, SESSION_DATA_KEY);
    this.#blob = null;
    this.#derived = null;
    this.#mode = null;
    this.#data = EMPTY_DATA;
    this.#state = 'empty';
    this.#emit();
  }

  async #persist(): Promise<void> {
    if (this.#mode === 'encrypted') {
      if (this.#derived == null) {
        throw new Error(t('vault.locked'));
      }
      this.#blob = await encryptJson(this.#derived, this.#data);
      writeString(localStorage, LOCAL_KEY, JSON.stringify(this.#blob));
    } else if (this.#mode === 'session') {
      writeString(sessionStorage, SESSION_DATA_KEY, JSON.stringify(this.#data));
    }
    this.#emit();
  }

  #assertUnlocked(): void {
    if (this.#state !== 'unlocked') {
      throw new Error(t('vault.locked'));
    }
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

export function newProfileId(): string {
  return `profile_${crypto.randomUUID()}`;
}

function isVaultData(value: unknown): value is VaultData {
  if (typeof value !== 'object' || value == null) {
    return false;
  }
  const data = value as Partial<VaultData>;
  return data.version === 1 && Array.isArray(data.profiles);
}

function readJson(storage: Storage, key: string): unknown {
  const raw = readString(storage, key);
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readString(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage blocked (private mode, quota): the in-memory state still works for this page load.
  }
}

function removeItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

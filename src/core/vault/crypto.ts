/**
 * Encryption at rest for the credential vault, WebCrypto only.
 *
 * Passphrase → PBKDF2-SHA256 (600k iterations, random 16-byte salt) → AES-256-GCM key.
 * Each encryption uses a fresh 12-byte IV. The key never leaves the WebCrypto
 * layer except through `exportKey`/`importKey`, used to keep a tab unlocked
 * across reloads (see vault.ts for the trade-off).
 */

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedBlob {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export interface DerivedKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

export async function deriveKey(
  passphrase: string,
  salt?: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<DerivedKey> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(actualSalt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  return { key, salt: actualSalt, iterations };
}

export async function encryptJson(derived: DerivedKey, value: unknown): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, derived.key, plaintext);
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: derived.iterations,
    salt: toBase64(derived.salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Rejects with a `WrongKeyError` when the key does not match (AES-GCM authentication fails). */
export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(blob.iv)) },
      key,
      toArrayBuffer(fromBase64(blob.data)),
    );
  } catch {
    throw new WrongKeyError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export class WrongKeyError extends Error {
  constructor() {
    super('Phrase de passe incorrecte.');
    this.name = 'WrongKeyError';
  }
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(new Uint8Array(raw));
}

export async function importKey(rawBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(fromBase64(rawBase64)), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  if (typeof value !== 'object' || value == null) {
    return false;
  }
  const blob = value as Partial<EncryptedBlob>;
  return (
    blob.v === 1 &&
    blob.kdf === 'PBKDF2-SHA256' &&
    typeof blob.iterations === 'number' &&
    typeof blob.salt === 'string' &&
    typeof blob.iv === 'string' &&
    typeof blob.data === 'string'
  );
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Copies into a plain ArrayBuffer so WebCrypto accepts it whatever the backing store. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

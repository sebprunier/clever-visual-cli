import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  deriveKey,
  encryptJson,
  exportKey,
  fromBase64,
  importKey,
  isEncryptedBlob,
  WrongKeyError,
} from './crypto.js';

// Fewer iterations keep the suite fast; the KDF itself is not what we test.
const ITERATIONS = 1_000;

describe('vault crypto', () => {
  it('round-trips a JSON value', async () => {
    const derived = await deriveKey('correct horse battery staple', undefined, ITERATIONS);
    const blob = await encryptJson(derived, { profiles: [{ alias: 'default' }] });

    expect(isEncryptedBlob(blob)).toBe(true);
    expect(blob.data).not.toContain('default');

    const reopened = await deriveKey('correct horse battery staple', fromBase64(blob.salt), blob.iterations);
    await expect(decryptJson(reopened.key, blob)).resolves.toEqual({ profiles: [{ alias: 'default' }] });
  });

  it('rejects a wrong passphrase with WrongKeyError', async () => {
    const derived = await deriveKey('right', undefined, ITERATIONS);
    const blob = await encryptJson(derived, { secret: 42 });

    const wrong = await deriveKey('wrong', fromBase64(blob.salt), blob.iterations);
    await expect(decryptJson(wrong.key, blob)).rejects.toBeInstanceOf(WrongKeyError);
  });

  it('uses a fresh IV for every encryption', async () => {
    const derived = await deriveKey('pass', undefined, ITERATIONS);
    const first = await encryptJson(derived, 'same');
    const second = await encryptJson(derived, 'same');
    expect(first.iv).not.toBe(second.iv);
    expect(first.data).not.toBe(second.data);
  });

  it('exports and re-imports a key that still decrypts', async () => {
    const derived = await deriveKey('pass', undefined, ITERATIONS);
    const blob = await encryptJson(derived, ['a', 'b']);
    const imported = await importKey(await exportKey(derived.key));
    await expect(decryptJson(imported, blob)).resolves.toEqual(['a', 'b']);
  });

  it('recognises malformed blobs', () => {
    expect(isEncryptedBlob(null)).toBe(false);
    expect(isEncryptedBlob({ v: 2 })).toBe(false);
    expect(isEncryptedBlob({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 1, salt: 's', iv: 'i', data: 'd' })).toBe(true);
  });
});

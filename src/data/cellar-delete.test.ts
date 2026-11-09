import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { describe, expect, it, vi } from 'vitest';
import { bucketDeletionRefusal, deleteCellarBucket, deleteCellarObject, objectDeletionRefusal } from './api.js';

vi.mock('@clevercloud/client/utils/error-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clevercloud/client/utils/error-utils.js')>()),
  isCcHttpErrorWithCode: (error: { code?: string }, code: string) => error.code === code,
  isNetworkError: (error: { network?: boolean }) => error.network === true,
}));

interface SentCommand {
  params: Record<string, unknown>;
  toRequestParams(params: unknown): { method: string; url: string; queryParams?: { toObject(): object } };
}

/** A client that only records what it is asked to send: nothing leaves the test. */
function fakeClient(): { client: CcApiClient; sent: SentCommand[] } {
  const sent: SentCommand[] = [];
  const client = { send: (command: SentCommand) => (sent.push(command), Promise.resolve()) };
  return { client: client as unknown as CcApiClient, sent };
}

describe('deleting from Cellar', () => {
  it('sends the file with its whole key', async () => {
    const { client, sent } = fakeClient();
    await deleteCellarObject(client, 'orga_1', 'cellar_2', 'assets', 'photos/cat.png');
    expect(sent[0].params).toEqual({
      ownerId: 'orga_1',
      addonId: 'cellar_2',
      bucketName: 'assets',
      objectKey: 'photos/cat.png',
    });
    expect(sent[0].toRequestParams(sent[0].params).method).toBe('DELETE');
  });

  it('never sends purgeObjects unless the purge is meant', async () => {
    const { client, sent } = fakeClient();
    await deleteCellarBucket(client, 'orga_1', 'cellar_2', 'assets', false);
    await deleteCellarBucket(client, 'orga_1', 'cellar_2', 'assets', true);
    const [without, purge] = sent.map((command) => command.toRequestParams(command.params));
    expect(without.method).toBe('DELETE');
    expect(without.queryParams?.toObject()).toEqual({});
    expect(purge.queryParams?.toObject()).toEqual({ purgeObjects: true });
  });

  it('tells why a file was not deleted', () => {
    expect(objectDeletionRefusal({ code: 'clever.cellar.object-not-found' })).toBe('gone');
    expect(objectDeletionRefusal({ code: 'clever.cellar.bucket-not-found' })).toBe('bucket');
    expect(objectDeletionRefusal({ code: 'clever.cellar.not-found' })).toBe('cellar');
    expect(objectDeletionRefusal({ network: true })).toBe('network');
    expect(objectDeletionRefusal({ code: 'other' })).toBeNull();
  });

  it('tells why a bucket was not deleted', () => {
    expect(bucketDeletionRefusal({ code: 'clever.cellar.bucket-not-empty' })).toBe('notEmpty');
    expect(bucketDeletionRefusal({ code: 'clever.cellar.bucket-not-found' })).toBe('gone');
    expect(bucketDeletionRefusal({ code: 'clever.cellar.not-found' })).toBe('cellar');
    expect(bucketDeletionRefusal({ network: true })).toBe('network');
    expect(bucketDeletionRefusal({ code: 'other' })).toBeNull();
  });
});

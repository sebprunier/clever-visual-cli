import { describe, expect, it } from 'vitest';
import { BUCKET_NAME_PATTERN, cellarCurl, createBucketCurl, prefixTrail } from './cellar.js';

describe('prefixTrail', () => {
  it('walks down a prefix, one directory at a time', () => {
    expect(prefixTrail('photos/2026/')).toEqual([
      { name: 'photos', prefix: 'photos/' },
      { name: '2026', prefix: 'photos/2026/' },
    ]);
    expect(prefixTrail('')).toEqual([]);
  });
});

describe('cellarCurl', () => {
  it('lists the buckets, or a bucket under a prefix', () => {
    expect(cellarCurl('orga_1', 'cellar_2')).toBe(
      'clever curl https://api.clever-cloud.com/v4/cellar/organisations/orga_1/cellar/cellar_2/buckets',
    );
    expect(cellarCurl('orga_1', 'cellar_2', 'assets', 'photos/2026/')).toBe(
      "clever curl 'https://api.clever-cloud.com/v4/cellar/organisations/orga_1/cellar/cellar_2/buckets/assets/objects?prefix=photos%2F2026%2F'",
    );
  });
});

describe('a new bucket', () => {
  it('takes a name that follows the S3 rules', () => {
    for (const name of ['abc', 'my-bucket', 'logs.2026', 'a1b2', 'x'.repeat(63)]) {
      expect(BUCKET_NAME_PATTERN.test(name), name).toBe(true);
    }
    for (const name of [
      'ab',
      'x'.repeat(64),
      'My-bucket',
      'my_bucket',
      '-bucket',
      'bucket-',
      'a..b',
      '192.168.1.1',
      'a b',
    ]) {
      expect(BUCKET_NAME_PATTERN.test(name), name).toBe(false);
    }
  });

  it('is created with clever curl, clever-tools having no Cellar command', () => {
    expect(createBucketCurl('orga_1', 'cellar_2', 'assets', false)).toBe(
      `clever curl -X POST -H 'Content-Type: application/json' -d '{"name":"assets","versioning":false}' https://api.clever-cloud.com/v4/cellar/organisations/orga_1/cellar/cellar_2/buckets`,
    );
    expect(createBucketCurl('orga_1', 'cellar_2', 'assets', true)).toContain('"versioning":true');
  });
});

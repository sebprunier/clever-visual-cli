import { describe, expect, it } from 'vitest';
import { cellarCurl, prefixTrail } from './cellar.js';

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

import { describe, expect, it } from 'vitest';
import {
  BUCKET_NAME_PATTERN,
  cellarCurl,
  createBucketCurl,
  filteredPrefix,
  objectCurl,
  prefixTrail,
  s3cmdGet,
  s3cmdList,
  s3Uri,
} from './cellar.js';

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

describe('the filter', () => {
  it('adds the start of the names to the open folder', () => {
    expect(filteredPrefix('photos/2026/', 'ca')).toBe('photos/2026/ca');
    expect(filteredPrefix('', 'Ph')).toBe('Ph');
    expect(filteredPrefix('photos/', '')).toBe('photos/');
  });

  it('is in the call the toolbar shows', () => {
    expect(cellarCurl('orga_1', 'cellar_2', 'assets', filteredPrefix('photos/', 'ca t'))).toBe(
      "clever curl 'https://api.clever-cloud.com/v4/cellar/organisations/orga_1/cellar/cellar_2/buckets/assets/objects?prefix=photos%2Fca%20t'",
    );
  });
});

describe('s3Uri', () => {
  it('names a bucket, or a folder in it', () => {
    expect(s3Uri('assets')).toBe('s3://assets/');
    expect(s3Uri('assets', 'photos/2026/')).toBe('s3://assets/photos/2026/');
  });
});

describe('s3cmd', () => {
  const head = [
    'cellar_vars=$(clever addon env addon_1 -F shell) \\',
    '  && eval "$cellar_vars" \\',
    '  && s3cmd --access_key=$CELLAR_ADDON_KEY_ID \\',
    '    --secret_key=$CELLAR_ADDON_KEY_SECRET \\',
    '    --host=$CELLAR_ADDON_HOST \\',
    '    --host-bucket=$CELLAR_ADDON_HOST \\',
  ].join('\n');

  it('lists a folder, the keys read by clever-tools when it runs', () => {
    expect(s3cmdList('addon_1', 'assets')).toBe(`${head}\n    ls s3://assets/`);
    expect(s3cmdList('addon_1', 'assets', 'photos/2026/')).toBe(`${head}\n    ls s3://assets/photos/2026/`);
  });

  it('downloads an object, its URI in one shell word', () => {
    expect(s3cmdGet('addon_1', 'assets', 'photos/cat.png')).toBe(`${head}\n    get s3://assets/photos/cat.png`);
    expect(s3cmdGet('addon_1', 'assets', "my cat's.png")).toBe(`${head}\n    get 's3://assets/my cat'\\''s.png'`);
  });

  it('is one command, chained, every line continued but the last', () => {
    const lines = s3cmdList('addon_1', 'assets').split('\n');
    expect(lines.filter((line) => !line.endsWith(' \\'))).toEqual(['    ls s3://assets/']);
  });

  it('never holds a key, only the names of the variables', () => {
    expect(s3cmdList('addon_1', 'assets')).not.toMatch(/--(access|secret)_key=[^$]/);
  });
});

describe('objectCurl', () => {
  const base = 'https://api.clever-cloud.com/v4/cellar/organisations/orga_1/cellar/cellar_2/buckets/assets/objects';

  it('reads one object, its key percent-encoded slashes included', () => {
    expect(objectCurl('orga_1', 'cellar_2', 'assets', 'photos/2026/cat.png')).toBe(
      `clever curl ${base}/photos%2F2026%2Fcat.png`,
    );
  });

  it('keeps keys with spaces, # ? and unicode in one shell word', () => {
    expect(objectCurl('orga_1', 'cellar_2', 'assets', 'a b#1?.txt')).toBe(`clever curl ${base}/a%20b%231%3F.txt`);
    expect(objectCurl('orga_1', 'cellar_2', 'assets', 'été/œuvre.pdf')).toBe(
      `clever curl ${base}/%C3%A9t%C3%A9%2F%C5%93uvre.pdf`,
    );
    expect(objectCurl('orga_1', 'cellar_2', 'assets', "it's.txt")).toBe(`clever curl '${base}/it'\\''s.txt'`);
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

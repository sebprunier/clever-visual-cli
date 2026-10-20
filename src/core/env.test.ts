import { describe, expect, it } from 'vitest';
import { maskValue, toDotenv } from './env.js';

describe('toDotenv', () => {
  it('leaves plain values bare and quotes the others', () => {
    expect(
      toDotenv([
        { name: 'REDIS_HOST', value: 'bxyz-redis.services.clever-cloud.com' },
        { name: 'REDIS_URL', value: 'redis://:p@ss@host:3000' },
        { name: 'GREETING', value: 'hello world' },
        { name: 'TRICKY', value: 'a"b$c\nd' },
      ]),
    ).toBe(
      [
        'REDIS_HOST=bxyz-redis.services.clever-cloud.com',
        'REDIS_URL=redis://:p@ss@host:3000',
        'GREETING="hello world"',
        'TRICKY="a\\"b\\$c\\nd"',
      ].join('\n'),
    );
  });
});

describe('maskValue', () => {
  it('hides a value behind 6 to 24 bullets', () => {
    expect(maskValue('')).toBe('');
    expect(maskValue('abc')).toHaveLength(6);
    expect(maskValue('x'.repeat(100))).toHaveLength(24);
  });
});
